# GPA Calculator API

This project is an Express.js-based API that fetches student results from a university portal and calculates the GPA for the student. It handles cases like specific students with restricted access, non-credit subjects, and deceased students.

## Features

- Fetches student results from a given university results page.
- Calculates the GPA based on the latest attempt of each subject.
- Excludes non-credit subjects from GPA calculation.
- Handles special cases:
  - Students with no access.
  - Deceased students.
  - Non-credit subjects excluded from GPA calculation.
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
Example Response:
json
Copy code
{
  "data": "<HTML of student results>",
  "gpa": "3.75",
  "mathGpa": "3.80",
  "chemGpa": "3.70",
  "phyGpa": "3.65",
  "zooGpa": "3.80",
  "botGpa": "3.70",
  "csGpa": "3.90"
}

```
Special Cases
No Access Students
If a student number is in the noAccessStnum array, they will receive a "No access" notification.

Example
If stnum=99999 is in the noAccessStnum array, the response will be:

json
```bash
{
  "message": "No access for this student number."
}
```
Deceased Students
If a student number is in the deceasedStnum array, the response will be "Rest in Peace".

Example
If stnum=88888 is in the deceasedStnum array, the response will be:

json
```bash
{
  "message": "Rest in Peace."
}
```
Non-Credit Subjects
Subjects listed in the nonCredit array will not be considered when calculating the GPA. This ensures that only credit-bearing subjects are included in the GPA calculation.

Example
If a subject like CS101 is in the nonCredit array, its marks will not be counted towards the GPA, even if the student passed it.

Other Examples
If a student has both non-credit and credit subjects, only the credit ones will be used to compute the GPA.
The system handles special grading rules like multiple attempts and calculates GPA based on the most recent attempt.
License
This project is licensed under the MIT License.

