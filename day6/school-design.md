# School Database Design

## 1. Table Explanations

### Students

The `students` table stores information about each student. It contains `student_id`, `name`, and `email`. The student ID is the primary key, which uniquely identifies each student. The name and email are required, and the email must be unique to prevent two students from registering with the same email address.

### Courses

The `courses` table stores information about the courses offered by the school. It contains `course_id`, `course_name`, and `description`. The course ID is the primary key, while the course name is required and unique so that each course can be identified clearly.

### Enrolments

The `enrolments` table records which students are taking which courses and the grades they receive. It contains `enrolment_id`, `student_id`, `course_id`, and `grade`. The enrolment ID is the primary key. The student ID and course ID are foreign keys that reference the `students` and `courses` tables. The grade can remain NULL until a student's work has been assessed. A UNIQUE constraint on `student_id` and `course_id` prevents a student from enrolling in the same course more than once.

## 2. Relationships Between Tables

The relationship between students and enrolments is one-to-many because one student can have multiple enrolment records, while each enrolment belongs to one student. Similarly, the relationship between courses and enrolments is one-to-many because one course can have many students enrolled in it, while each enrolment refers to one course.

Students and courses have a many-to-many relationship. A student can take several courses, and each course can have several students. The `enrolments` table acts as a join table that resolves this many-to-many relationship into two one-to-many relationships. It also stores information specific to the relationship, such as the student's grade in a particular course.

## 3. Index

I would add an index on `enrolments.course_id` to speed up queries that retrieve all students enrolled in a particular course or count enrolments for each course. This is useful when the school has many students and courses. Although indexes improve lookup performance, they require additional storage and can make insertions and updates slightly slower.

## 4. SQL or NoSQL?

I would choose a relational SQL database such as SQLite for this school system. The data has a clear structure, with students, courses, and enrolments connected through primary and foreign keys. SQL supports JOIN operations, aggregate functions, and constraints that help maintain data accuracy and prevent duplicate enrolments. The database can also store grades alongside the relevant enrolment. SQLite is suitable for a small school application because it is lightweight and does not require a separate database server. If the system grows to support many concurrent users across multiple locations, a server-based relational database such as PostgreSQL could be a better choice.
