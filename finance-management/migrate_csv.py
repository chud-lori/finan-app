import csv
import requests
import re
from datetime import datetime
import pytz

def format_amount(amount_str):
    # Remove "Rp", commas, whitespace and convert to int
    cleaned = re.sub(r'[Rp,\s]', '', amount_str)
    return int(cleaned)

def migrate():
    url = 'http://127.0.0.1:3000/api/transaction'
    bearer_token = ''

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {bearer_token}'
    }

    with open('transactions.csv', newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            payload = {
                "description": row['Title'],
                "category": row['Category'],
                "amount": format_amount(row['Amount']),
                "currency": "idr",
                "type": row['Type'].lower(),
                "time": row['Timestamp'],
                "transaction_timezone": "Asia/Jakarta"
            }
            response = requests.post(url, json=payload, headers=headers)
            if response.status_code == 201:
                print(f"Added transaction: {row['Title']}")
            else:
                print(f"Failed to add {row['Title']}: {response.status_code}, {response.text}")

def convert_utc_iso_to_timezone_with_offset(iso_utc_str, timezone_str):
    """
    Convert a UTC ISO 8601 datetime string to a target timezone
    and return both converted datetime and its UTC offset string.

    Args:
    - iso_utc_str (str): ISO 8601 datetime string, e.g. "2025-09-27T11:50:00.000+00:00"
    - timezone_str (str): IANA timezone string, e.g. "Asia/Jakarta"

    Returns:
    - tuple: (datetime in target timezone, UTC offset string like '+07:00')
    """
    # Parse ISO 8601 string to datetime object
    utc_dt = datetime.fromisoformat(iso_utc_str)

    # Convert to UTC to standardize
    utc_dt = utc_dt.astimezone(pytz.utc)

    # Get target timezone object
    target_tz = pytz.timezone(timezone_str)

    # Convert to target timezone
    converted_dt = utc_dt.astimezone(target_tz)

    # Get UTC offset as timedelta
    offset_td = converted_dt.utcoffset()

    # Format offset to string +/-HH:MM
    total_seconds = offset_td.total_seconds()
    sign = '+' if total_seconds >= 0 else '-'
    total_seconds = abs(int(total_seconds))
    hours, remainder = divmod(total_seconds, 3600)
    minutes = remainder // 60
    offset_str = f"{sign}{hours:02}:{minutes:02}"

    return converted_dt, offset_str

# Example usage
# iso_utc = "2025-09-27T11:49:49.000+00:00"
# jakarta_time, jakarta_offset = convert_utc_iso_to_timezone_with_offset(iso_utc, "Asia/Jakarta")
# print("Jakarta time:", jakarta_time)
# print("UTC offset:", jakarta_offset)
migrate()
