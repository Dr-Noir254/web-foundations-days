# SnapShare Photo App Scaling Plan

## 1. Assumptions and estimates

SnapShare is a photo-sharing app where users upload photos and scroll through photos from people they follow.

### Assumptions

- There are 10,000,000 registered users.
- 10% of registered users are active each day.
- Each daily active user uploads 1 photo per day and views 50 feed pages per day.
- Each original photo is 2 MB and each thumbnail is 50 KB.
- A year has 365 days and a day has 86,400 seconds.
- Peak feed traffic is estimated as 5 times the average feed traffic.
- Storage calculations use decimal units: 1 TB = 1,000,000 MB. The estimates exclude backups, replicas, metadata, and storage overhead.
- For a simple estimate, all daily active users are assumed to upload one photo every day; actual usage will vary.

### Calculations

**Daily active users (DAU)**

10,000,000 registered users × 10% = **1,000,000 daily active users**.

**Uploads per second**

- Uploads per day: 1,000,000 users × 1 photo = 1,000,000 photos/day.
- Average uploads per second: 1,000,000 ÷ 86,400 = **about 11.6 uploads/second**.

**Feed views per second**

- Feed views per day: 1,000,000 users × 50 pages = 50,000,000 feed views/day.
- Average feed views per second: 50,000,000 ÷ 86,400 = **about 579 feed views/second**.
- Peak feed views per second: 579 × 5 = **about 2,895 feed views/second**.

**Photo storage per year**

- Original photos per year: 1,000,000 photos/day × 365 = 365,000,000 photos/year.
- Original photo storage: 365,000,000 × 2 MB = 730,000,000 MB = **730 TB/year**.
- Thumbnails: 365,000,000 × 50 KB = 18,250,000,000 KB = **18.25 TB/year**.
- Total for originals and thumbnails: 730 TB + 18.25 TB = **748.25 TB/year**.

These figures estimate new storage added each year, not the total accumulated storage over multiple years.

## 2. Read-heavy or write-heavy?

SnapShare is **read-heavy**. It handles about 579 feed views per second on average (around 2,895 at the estimated peak) compared with about 12 photo uploads per second on average. The design should therefore prioritize fast feed reads using a CDN, cache, and database read replica, while using a queue to process uploads and thumbnails asynchronously.

## 3. Where photo files should be stored

Photo files should be stored in **object storage**, not directly inside the relational database. Large binary files in a database can increase database size, backups, and restore times, and compete with feed queries for database resources. The database should store metadata such as the photo ID, owner, caption, timestamps, access permissions, and object-storage key or URL. Object storage is designed for large files and can scale independently; a CDN can cache and deliver frequently viewed photos and thumbnails close to users.

## 4. Text architecture diagram

```text
                           +----------------------+
                           |        Users         |
                           +----------+-----------+
                                      |
                         +------------+-------------+
                         | CDN: cached photos and   |
                         | thumbnails (photo reads) |
                         +------------+-------------+
                                      |
                              Feed/API requests
                                      |
                           +----------v-----------+
                           |    Load Balancer     |
                           +----------+-----------+
                                      |
                    +-----------------+-----------------+
                    |                                   |
             +------v-------+                    +------v-------+
             | App Server 1 |       ...          | App Server N |
             +------+-------+                    +------+-------+
                    |                                   |
                    +-----------------+-----------------+
                                      |
                         +------------+------------+
                         |                         |
                  +------v------+           +------v-------+
                  | Cache       |           | Primary DB   |
                  | feed/data   |           | metadata and |
                  +-------------+           | write traffic|
                                            +------+-------+
                                                   |
                                            Replication
                                                   |
                                            +------v-------+
                                            | Read Replica |
                                            | feed queries |
                                            +--------------+

Photo upload path:
 App Server --> Object Storage (original photo)
      |
      +--> Queue --> Thumbnail Worker --> Object Storage (thumbnail)
                          |
                          +--> updates photo metadata/status in DB
```

## 5. What each component does

- **CDN:** Delivers cached photo files and thumbnails from locations closer to users, reducing latency and load on the origin storage.
- **Load balancer:** Distributes incoming API traffic across healthy app servers so that one server does not become a bottleneck.
- **App servers:** Authenticate users and implement upload, follow, feed, and photo-metadata APIs without relying on one application machine.
- **Cache:** Keeps frequently requested feed data and metadata in fast memory to reduce repeated database queries.
- **Primary database:** Reliably stores and updates structured information such as users, follows, photo metadata, captions, and permissions.
- **Read replica:** Serves read-heavy feed and metadata queries so they do not all compete with writes on the primary database.
- **Object storage:** Stores original photos and generated thumbnails as files, scaling separately from the relational database.
- **Queue:** Holds thumbnail-generation jobs so uploads can finish without waiting for image processing and workers can retry failed jobs.
- **Thumbnail worker:** Pulls jobs from the queue, creates smaller image versions, stores them in object storage, and updates processing status in the database.

## 6. Photo upload flow

1. The user selects a photo and submits it through the app.
2. The load balancer sends the request to a healthy app server.
3. The app server authenticates the user, checks upload limits and file type/size, and creates a photo record with a pending-processing status.
4. The original image is uploaded to object storage; the database stores its object key and relevant metadata, not the image bytes.
5. The app server publishes a thumbnail-generation job containing the photo ID and object-storage key to the queue.
6. The app confirms that the upload has been accepted without making the user wait for thumbnail generation.
7. A thumbnail worker consumes the job, reads the original from object storage, generates a 50 KB thumbnail (or a suitably sized thumbnail), and saves it back to object storage.
8. The worker updates the database with the thumbnail key and marks processing as complete; failed jobs can be retried.
9. When followers view their feed, the app retrieves feed metadata from cache or the read replica and returns photo URLs; the CDN serves the original or thumbnail files.

## 7. Trade-offs

1. **Caching versus freshness:** Cache improves feed speed and reduces database load, but a newly uploaded photo or changed caption may not appear immediately unless cache invalidation or short time-to-live (TTL) rules are used.
2. **Asynchronous thumbnails versus immediate completeness:** A queue makes uploads faster and allows retries, but a photo may appear before its thumbnail is ready; the app should show a placeholder until processing completes.
3. **Read replicas versus consistency:** Read replicas increase read capacity, but replication lag can mean a newly uploaded photo is briefly missing from feed results; the app can read recent writes from the primary or tolerate a short delay.
4. **CDN performance versus invalidation and cost:** A CDN lowers latency and origin traffic, but cached files may remain stale until expiry or invalidation, and high traffic/storage delivery incurs CDN costs.
5. **Precomputed feeds versus compute-on-read:** Precomputing feeds makes scrolling faster but uses more storage and work when users post; building feeds on demand saves feed storage but can increase query latency for users following many accounts.

## Conclusion

With 1 million daily active users, SnapShare is expected to add about 1 million original photos per day and roughly 748.25 TB of original-plus-thumbnail data per year under these assumptions. Feed reads dominate, so the architecture separates photo files from database metadata and scales delivery with a CDN, cache, read replica, and asynchronous thumbnail workers.
