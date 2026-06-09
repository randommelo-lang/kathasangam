import os

old_ver = "v=storage-cleanup-20260604-v23"
new_ver = "v=genres-tags-20260605-v24"

# Update index.html
if os.path.exists("d:/App/kathasangam/index.html"):
    with open("d:/App/kathasangam/index.html", "r", encoding="utf-8") as f:
        content = f.read()
    if old_ver in content:
        print("Updating cache buster in index.html")
        updated = content.replace(old_ver, new_ver)
        with open("d:/App/kathasangam/index.html", "w", encoding="utf-8") as f:
            f.write(updated)

# Update all JS files
for root, dirs, files in os.walk("d:/App/kathasangam/js"):
    for file in files:
        if file.endswith(".js"):
            file_path = os.path.join(root, file)
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
            if old_ver in content:
                print(f"Updating cache buster in: {file_path}")
                updated = content.replace(old_ver, new_ver)
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(updated)

print("Cache buster update completed successfully!")
