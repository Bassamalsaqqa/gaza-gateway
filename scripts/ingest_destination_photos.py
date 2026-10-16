#!/usr/bin/env python3
"""
Gaza Gateway — Destination Photo Ingestion Pipeline
Processes owner-supplied destination photos for the 13 memorial expansion cities.
Generates responsive WebP variants (480, 800, 1200, 1600, 1920) with EXIF normalization.
Outputs manifest tracking hashes, dimensions, file sizes, and compression metrics.
"""

import os
import json
import hashlib
from PIL import Image, ImageOps

INPUT_DIR = os.path.join("scratch", "inputs", "cities")
OUTPUT_DIR = os.path.join("src", "assets", "media", "destinations")
MANIFEST_PATH = os.path.join("scratch", "destination_ingestion_manifest.json")

# Target widths established in Gaza Gateway responsive design
TARGET_WIDTHS = [480, 800, 1200, 1600, 1920]
WEBP_QUALITY = 80
WEBP_METHOD = 6

CITY_MAPPINGS = [
    {
        "code": "AUH",
        "cityEn": "Abu Dhabi",
        "cityAr": "أبوظبي",
        "inputFile": "Abu-Dhabi.jpg",
        "slug": "abu-dhabi",
        "photoId": "city-abu-dhabi",
        "focalPoint": {"x": 65, "y": 50},
        "alt": {
            "en": "Modern waterfront skyline and towers in Abu Dhabi under daylight sky",
            "ar": "أفق وأبراج الواجهة البحرية الحديثة في أبوظبي في وضح النهار"
        }
    },
    {
        "code": "ATH",
        "cityEn": "Athens",
        "cityAr": "أثينا",
        "inputFile": "Athens.jpg",
        "slug": "athens",
        "photoId": "city-athens",
        "focalPoint": {"x": 55, "y": 50},
        "alt": {
            "en": "Daylight panoramic view across Athens towards Mount Lycabettus",
            "ar": "مشهد بانورامي نهاري لمدينة أثينا باتجاه تلة ليكابيتوس"
        }
    },
    {
        "code": "BEY",
        "cityEn": "Beirut",
        "cityAr": "بيروت",
        "inputFile": "Beirut.jpg",
        "slug": "beirut",
        "photoId": "city-beirut",
        "focalPoint": {"x": 45, "y": 55},
        "alt": {
            "en": "Coastal sea rocks and Mediterranean coastline in Beirut at dusk",
            "ar": "صخور الروشة والساحل المتوسطي في بيروت عند الغروب"
        }
    },
    {
        "code": "FRA",
        "cityEn": "Frankfurt",
        "cityAr": "فرانكفورت",
        "inputFile": "Frankfurt.jpg",
        "slug": "frankfurt",
        "photoId": "city-frankfurt",
        "focalPoint": {"x": 50, "y": 50},
        "alt": {
            "en": "River Main and downtown skyline of Frankfurt under daylight",
            "ar": "نهر الماين وأفق وسط مدينة فرانكفورت نهاراً"
        }
    },
    {
        "code": "KUL",
        "cityEn": "Kuala Lumpur",
        "cityAr": "كوالالمبور",
        "inputFile": "Kuala Lumpur.jpg",
        "slug": "kuala-lumpur",
        "photoId": "city-kuala-lumpur",
        "focalPoint": {"x": 50, "y": 45},
        "alt": {
            "en": "Petronas Twin Towers and central cityscape of Kuala Lumpur illuminated at night",
            "ar": "برجا بتروناس التوأم وأفق كوالالمبور مضاءين ليلاً"
        }
    },
    {
        "code": "KWI",
        "cityEn": "Kuwait City",
        "cityAr": "مدينة الكويت",
        "inputFile": "Kuwait City.jpg",
        "slug": "kuwait-city",
        "photoId": "city-kuwait-city",
        "focalPoint": {"x": 55, "y": 45},
        "alt": {
            "en": "Waterfront skyline of Kuwait City with Liberation Tower and minaret in daylight",
            "ar": "أفق الواجهة البحرية لمدينة الكويت مع برج التحرير ومئذنة المسجد نهاراً"
        }
    },
    {
        "code": "LHR",
        "cityEn": "London",
        "cityAr": "لندن",
        "inputFile": "London.jpg",
        "slug": "london",
        "photoId": "city-london",
        "focalPoint": {"x": 60, "y": 50},
        "alt": {
            "en": "River Thames, Westminster Bridge and the Palace of Westminster in London",
            "ar": "نهر التايمز وجسر وستمنستر وقصر وستمنستر في لندن"
        }
    },
    {
        "code": "MAD",
        "cityEn": "Madrid",
        "cityAr": "مدريد",
        "inputFile": "Madrid.jpg",
        "slug": "madrid",
        "photoId": "city-madrid",
        "focalPoint": {"x": 50, "y": 50},
        "alt": {
            "en": "Cityscape of Madrid featuring Cybele Palace under daylight sky",
            "ar": "مشهد حضري لمدينة مدريد يبرز قصر سيبيليس نهاراً"
        }
    },
    {
        "code": "BOM",
        "cityEn": "Mumbai",
        "cityAr": "مومباي",
        "inputFile": "Mumbai.jpg",
        "slug": "mumbai",
        "photoId": "city-mumbai",
        "focalPoint": {"x": 50, "y": 40},
        "alt": {
            "en": "Gateway of India monument in Mumbai with visitors in the plaza",
            "ar": "نصب بوابة الهند في مومباي مع الزوار في الساحة"
        }
    },
    {
        "code": "JFK",
        "cityEn": "New York",
        "cityAr": "نيويورك",
        "inputFile": "New York.jpg",
        "slug": "new-york",
        "photoId": "city-new-york",
        "focalPoint": {"x": 50, "y": 45},
        "alt": {
            "en": "Aerial view over Midtown Manhattan overlooking Central Park in daylight",
            "ar": "مشهد جوي لأبراج وسط مانهاتن وحديقة سنترال بارك في نيويورك نهاراً"
        }
    },
    {
        "code": "CDG",
        "cityEn": "Paris",
        "cityAr": "باريس",
        "inputFile": "Paris.jpg",
        "slug": "paris",
        "photoId": "city-paris",
        "focalPoint": {"x": 60, "y": 50},
        "alt": {
            "en": "Parisian rooftops and classical architecture with the Eiffel Tower in the distance",
            "ar": "أسطح باريس والعمارة الكلاسيكية مع برج إيفل في الأفق"
        }
    },
    {
        "code": "FCO",
        "cityEn": "Rome",
        "cityAr": "روما",
        "inputFile": "Rome.jpg",
        "slug": "rome",
        "photoId": "city-rome",
        "focalPoint": {"x": 50, "y": 40},
        "alt": {
            "en": "The Colosseum in Rome bathed in warm afternoon sunlight",
            "ar": "الكولوسيوم في روما في ضوء شمس بعد الظهيرة الدافئ"
        }
    },
    {
        "code": "YYZ",
        "cityEn": "Toronto",
        "cityAr": "تورونتو",
        "inputFile": "Toronto.jpg",
        "slug": "toronto",
        "photoId": "city-toronto",
        "focalPoint": {"x": 50, "y": 52},
        "alt": {
            "en": "Panoramic skyline of Toronto and the CN Tower across Lake Ontario",
            "ar": "أفق مدينة تورونتو وبرج سي إن عبر بحيرة أونتاريو نهاراً"
        }
    }
]


def sha256_file(filepath: str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def process_images():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    manifest = {
        "pipeline": "Gaza Gateway Destination Ingestion v1",
        "quality": WEBP_QUALITY,
        "method": WEBP_METHOD,
        "cities": []
    }

    grand_total_input_bytes = 0
    grand_total_output_bytes = 0

    print(f"Starting ingestion of {len(CITY_MAPPINGS)} cities...")

    for city in CITY_MAPPINGS:
        in_path = os.path.join(INPUT_DIR, city["inputFile"])
        if not os.path.exists(in_path):
            raise FileNotFoundError(f"Input image not found: {in_path}")

        in_size = os.path.getsize(in_path)
        in_hash = sha256_file(in_path)
        grand_total_input_bytes += in_size

        with Image.open(in_path) as raw_im:
            # Normalize EXIF orientation and strip metadata
            im = ImageOps.exif_transpose(raw_im)
            if im.mode not in ("RGB", "L"):
                im = im.convert("RGB")

            raw_w, raw_h = raw_im.size
            norm_w, norm_h = im.size

            city_entry = {
                "code": city["code"],
                "cityEn": city["cityEn"],
                "cityAr": city["cityAr"],
                "photoId": city["photoId"],
                "slug": city["slug"],
                "inputFile": city["inputFile"],
                "inputSha256": in_hash,
                "inputBytes": in_size,
                "rawDimensions": {"width": raw_w, "height": raw_h},
                "normalizedDimensions": {"width": norm_w, "height": norm_h},
                "focalPoint": city["focalPoint"],
                "alt": city["alt"],
                "variants": []
            }

            city_output_bytes = 0

            # Generate responsive WebP variants without upscaling
            for target_w in TARGET_WIDTHS:
                if target_w > norm_w:
                    # Do not upscale
                    actual_w = norm_w
                    actual_h = norm_h
                else:
                    actual_w = target_w
                    actual_h = round(norm_h * (target_w / norm_w))

                out_filename = f"{city['slug']}-{actual_w}.webp"
                out_path = os.path.join(OUTPUT_DIR, out_filename)

                # Resize with high quality Lanczos
                if actual_w == norm_w and actual_h == norm_h:
                    resized = im
                else:
                    resized = im.resize((actual_w, actual_h), Image.Resampling.LANCZOS)

                # Save clean WebP without EXIF
                resized.save(out_path, "WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD)

                out_size = os.path.getsize(out_path)
                out_hash = sha256_file(out_path)
                city_output_bytes += out_size
                grand_total_output_bytes += out_size

                city_entry["variants"].append({
                    "width": actual_w,
                    "height": actual_h,
                    "filename": out_filename,
                    "bytes": out_size,
                    "sha256": out_hash
                })

            city_entry["totalOutputBytes"] = city_output_bytes
            city_entry["savingsBytes"] = in_size - city_output_bytes
            city_entry["savingsPercent"] = round((1 - (city_output_bytes / in_size)) * 100, 2)

            manifest["cities"].append(city_entry)
            print(f"[{city['code']}] {city['cityEn']:15s}: {in_size:,} B -> {city_output_bytes:,} B ({city_entry['savingsPercent']}% savings)")

    manifest["summary"] = {
        "cityCount": len(CITY_MAPPINGS),
        "totalVariants": len(CITY_MAPPINGS) * len(TARGET_WIDTHS),
        "totalInputBytes": grand_total_input_bytes,
        "totalOutputBytes": grand_total_output_bytes,
        "totalSavingsBytes": grand_total_input_bytes - grand_total_output_bytes,
        "totalSavingsPercent": round((1 - (grand_total_output_bytes / grand_total_input_bytes)) * 100, 2)
    }

    with open(MANIFEST_PATH, "w", encoding="utf-8") as mf:
        json.dump(manifest, mf, indent=2, ensure_ascii=False)

    print("\nIngestion Summary:")
    print(f"  Total input JPGs:        {len(CITY_MAPPINGS)}")
    print(f"  Total generated variants: {manifest['summary']['totalVariants']}")
    print(f"  Total input bytes:        {grand_total_input_bytes:,} B ({grand_total_input_bytes / (1024*1024):.2f} MB)")
    print(f"  Total output bytes:       {grand_total_output_bytes:,} B ({grand_total_output_bytes / (1024*1024):.2f} MB)")
    print(f"  Net space saved:          {manifest['summary']['totalSavingsBytes']:,} B ({manifest['summary']['totalSavingsPercent']}%)")
    print(f"  Manifest written to:      {MANIFEST_PATH}")


if __name__ == "__main__":
    process_images()
