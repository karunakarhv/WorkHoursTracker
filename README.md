# WorkHoursTracker

Simple web app to track work hours using Flask and SQLite.

## Features

- Clock in and clock out
- View today's entries
- Persistent storage using clocklogs.db (SQLite)

## Requirements

- Python 3.7+
- Flask

## Installation

1. Clone or download the repository.
2. Install dependencies:
   pip install -r requirements.txt

## Project Structure

- app.py
- requirements.txt
- clocklogs.db (created automatically)
- templates/
  - index.html

## How to Run

1. Ensure your app is saved as app.py.
2. Verify requirements.txt contains Flask.
3. Place index.html in a templates directory.
4. Open terminal and navigate to the project folder.
5. Install dependencies:
   pip install -r requirements.txt
6. Set environment variables:
   On Linux/macOS:
     export FLASK_APP=app.py
     export FLASK_ENV=development
   On Windows (Command Prompt):
     set FLASK_APP=app.py
     set FLASK_ENV=development
   On Windows (PowerShell):
     $env:FLASK_APP = "app.py"
     $env:FLASK_ENV = "development"
7. Start the app:
   flask run
8. Access in your browser:
   http://127.0.0.1:5000/

## Troubleshooting

- Install dependencies before running:
  pip install -r requirements.txt
- If Flask is missing, check your installation.
- For remote access, use:
  flask run --host=0.0.0.0
  and access via your server's IP address.
## Notes

- Data is stored in the clocklogs.db SQLite database for persistence.
- For advanced persistence or scaling, consider using a more robust database such as PostgreSQL.
