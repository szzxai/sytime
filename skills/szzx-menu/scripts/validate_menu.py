#!/usr/bin/env python3
"""Offline eight-field validation. Does not evaluate image recognition accuracy."""
import calendar
import json
import math
import re
import sys
from pathlib import Path

FIELDS = {"date", "weekday", "time", "place", "group", "name", "price", "spicy"}
TIMES = ["morning", "noon", "evening", "night"]
WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


def validate(records):
    if not isinstance(records, list) or not 1 <= len(records) <= 20000:
        raise ValueError("Require an array of 1 to 20000 records")
    for index, row in enumerate(records, 1):
        def fail(message):
            raise ValueError(f"Record {index}: {message}")
        if not isinstance(row, dict) or set(row) != FIELDS:
            fail("require exactly eight fields")
        for field, maximum in (("name", 200), ("place", 100), ("group", 100)):
            value = row[field]
            if value is None and field != "name":
                continue
            if not isinstance(value, str) or len(value) > maximum:
                fail(f"invalid {field}")
            if field == "name" and (not value.strip() or re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", value)):
                fail("invalid name")
        value = row["time"]
        if not isinstance(value, list) or any(not isinstance(x, str) or x not in TIMES for x in value) or len(value) != len(set(value)):
            fail("invalid time")
        if row["weekday"] is not None and row["weekday"] not in WEEKDAYS:
            fail("invalid weekday")
        value = row["date"]
        if value is not None:
            if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value, re.ASCII):
                fail("invalid date")
            year, month, day = map(int, value.split("-"))
            if not 1 <= month <= 12 or not 1 <= day <= calendar.monthrange(year, month)[1]:
                fail("invalid calendar date")
            if row["weekday"] is not None and row["weekday"] != WEEKDAYS[calendar.weekday(year, month, day)]:
                fail("date and weekday disagree")
        value = row["price"]
        if value is not None and (type(value) not in (int, float) or value < 0 or value > sys.float_info.max or not math.isfinite(value)):
            fail("invalid price")
        if row["spicy"] is not None and type(row["spicy"]) is not bool:
            fail("invalid spicy")
    return len(records)


def reject_constant(value):
    raise ValueError(f"Invalid JSON numeric constant: {value}")


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python validate_menu.py menu.json")
        file = Path(sys.argv[1])
        if file.stat().st_size > 6 * 1024 * 1024:
            raise ValueError("JSON exceeds 6 MB")
        records = json.loads(file.read_text(encoding="utf-8"), parse_constant=reject_constant, object_pairs_hook=unique_object)
        print(f"Valid eight-field JSON: {validate(records)} records. Image completeness still requires human review.")
    except (ValueError, OSError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
