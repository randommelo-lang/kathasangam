import os
import re

new_ver = "v=comic-fit-20260609-v27"
pattern = re.compile(r'\?v=[a-zA-Z0-9_-]+')

# Update index.html
if os.path.exists("index.html"):
    with open("index.html", "r", encoding="utf-8") as f:
        content = f.read()
    new_content = pattern.sub(f"?{new_ver}", content)
    if new_content != content:
        print("Updating cache busters in index.html")
        with open("index.html", "w", encoding="utf-8") as f:
            f.write(new_content)

# Update JS files
for root, dirs, files in os.walk("js"):
    for file in files:
        if file.endswith(".js"):
            file_path = os.path.join(root, file)
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
            new_content = pattern.sub(f"?{new_ver}", content)
            if new_content != content:
                print(f"Updating cache busters in: {file_path}")
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(new_content)

print("All cache buster updates completed successfully!")
