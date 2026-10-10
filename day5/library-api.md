
# Library Books REST API

## Overview

This API allows users to list, retrieve, create, update, and delete books in a library system. It also supports searching for books by author.

**Base URL:** `https://api.example.com`

## Endpoints

### 1. List All Books

- **Method:** GET
- **Path:** `/books`
- **Description:** Returns a list of all books in the library.
- **Success status:** `200 OK`
- **Example request body:** Not required.

### 2. Get One Book

- **Method:** GET
- **Path:** `/books/{id}`
- **Description:** Returns details of a book with the specified ID.
- **Success status:** `200 OK`
- **Example request body:** Not required.

### 3. Create a Book

- **Method:** POST
- **Path:** `/books`
- **Description:** Adds a new book to the library.
- **Example request body:**

  ```json
  {
    "title": "Things Fall Apart",
    "author": "Chinua Achebe",
    "publishedYear": 1958
  }
  ```

- **Success status:** `201 Created`

### 4. Update a Book

- **Method:** PUT
- **Path:** `/books/{id}`
- **Description:** Replaces the details of an existing book.
- **Example request body:**

  ```json
  {
    "title": "Things Fall Apart",
    "author": "Chinua Achebe",
    "publishedYear": 1958
  }
  ```

- **Success status:** `200 OK`

### 5. Delete a Book

- **Method:** DELETE
- **Path:** `/books/{id}`
- **Description:** Deletes the book with the specified ID.
- **Success status:** `204 No Content`
- **Example request body:** Not required.

### 6. List Books by Author

- **Method:** GET
- **Path:** `/books?author=Chinua%20Achebe`
- **Description:** Returns books written by the specified author using the `author` query parameter.
- **Success status:** `200 OK`
- **Example request body:** Not required.

## Error Responses

### 400 Bad Request

- **Description:** The request contains invalid data or parameters.
- **Example:** Creating a book without a required title or author.

### 404 Not Found

- **Description:** The requested resource does not exist.
- **Example:** Requesting `GET /books/999` when no book has ID `999`.