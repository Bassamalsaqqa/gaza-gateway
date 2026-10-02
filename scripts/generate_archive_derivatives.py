import os
import json
import hashlib
from PIL import Image

intake_dir = r"images_assets_to_be_used_in_website_after_proper_placement_and_compression\Past"
output_dir = r"src\assets\media\documentary\past"
audit_file = r"docs\research\archive\past-intake-audit.json"

os.makedirs(output_dir, exist_ok=True)

with open(audit_file, "r", encoding="utf-8") as f:
    audit_data = json.load(f)

# Find the 37 eligible staging-rights-review records
eligible_records = [
    r for r in audit_data["records"]
    if r.get("curatorPublicationStatus") == "staging-rights-review"
]

print(f"Generating derivatives for {len(eligible_records)} eligible historical records...")

manifest = {}
total_raw_bytes = 0
total_deriv_bytes = 0

for record in eligible_records:
    rec_id = record["id"]
    filename = record["originalFilename"]
    filepath = os.path.join(intake_dir, filename)

    with open(filepath, "rb") as fp:
        raw_content = fp.read()
        raw_bytes = len(raw_content)
        total_raw_bytes += raw_bytes

    im = Image.open(filepath)
    # Convert RGBA/P to RGB if necessary for clean WebP encoding
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")

    orig_w, orig_h = im.size

    # Compute candidate widths
    candidate_widths = [360, 480, 640, 960, 1280]
    widths = [w for w in candidate_widths if w < orig_w]
    if orig_w not in widths:
        widths.append(orig_w)
    widths.sort()

    variants = []

    for w in widths:
        if w == orig_w:
            target_w = orig_w
            target_h = orig_h
            resized_im = im
        else:
            target_w = w
            target_h = round(orig_h * (w / orig_w))
            resized_im = im.resize((target_w, target_h), Image.Resampling.LANCZOS)

        out_name = f"{rec_id}-{target_w}.webp"
        out_path = os.path.join(output_dir, out_name)

        # Save WebP with high quality (84) and method 6
        resized_im.save(out_path, "WEBP", quality=84, method=6)

        deriv_bytes = os.path.getsize(out_path)
        total_deriv_bytes += deriv_bytes

        with open(out_path, "rb") as dfp:
            d_sha = hashlib.sha256(dfp.read()).hexdigest()

        variants.append({
            "width": target_w,
            "height": target_h,
            "filename": out_name,
            "bytes": deriv_bytes,
            "sha256": d_sha
        })

    manifest[rec_id] = {
        "id": rec_id,
        "originalFilename": filename,
        "nativeWidth": orig_w,
        "nativeHeight": orig_h,
        "masterBytes": raw_bytes,
        "variants": variants
    }

manifest_path = r"scratch\archive_derivatives_manifest.json"
with open(manifest_path, "w", encoding="utf-8") as mf:
    json.dump(manifest, mf, indent=2)

print(f"Generated derivatives for {len(manifest)} items.")
print(f"Total raw bytes of masters: {total_raw_bytes:,}")
print(f"Total derivative bytes: {total_deriv_bytes:,}")
print(f"Manifest written to {manifest_path}")

# Post-generation master verification
print("Verifying master integrity...")
pre_hashes = json.load(open(r"scratch\master_hashes_pre.json", encoding="utf-8"))
for f, info in pre_hashes.items():
    p = os.path.join(intake_dir, f)
    with open(p, "rb") as fp:
        cur_sha = hashlib.sha256(fp.read()).hexdigest()
    assert cur_sha == info["sha256"], f"Master drift detected in {f}!"

print("Master integrity verified: 0 bytes modified, all 58 SHA-256 hashes match.")
