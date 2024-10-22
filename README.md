# GPA Calculator API

This project is an Express.js-based API that fetches student results from a university portal and calculates the GPA for the student. It handles cases like specific students with restricted access, non-credit subjects, and deceased students.

## Features

- Fetches student results from a given university results page.
- Calculates the GPA based on the latest attempt of each subject.
- Excludes non-credit subjects from GPA calculation.
- Handles special cases:
  - Students with no access.
  - Deceased students.
- Provides subject-specific GPAs (Math, Chemistry, Physics, etc.).

## Installation

1. Clone this repository:

    ```bash
    git clone <repository-url>
    ```

2. Install dependencies:

    ```bash
    npm install
    ```

3. Start the server:

    ```bash
    npm start
    ```

   By default, the server will run on port `3000`.

## Endpoints

### `GET /results`

Fetches student results and calculates the GPA.

#### Query Parameters:

- `stnum` (required): The student number.
- `rlevel` (required): The result level.

#### Example Request:

```bash
GET http://localhost:3000/results?stnum=12345&rlevel=2

 
