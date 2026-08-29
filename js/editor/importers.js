export async function importComicPdf(file, ctx, uploadStatus, onPageAdded) {
  if (!file) return;
  uploadStatus.textContent = "Processing " + file.name + "...";

  const reader = new FileReader();
  reader.onload = async function (evt) {
    const arrayBuffer = evt.target.result;
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "js/vendor/pdf.worker.min.js";
      try {
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages;
        let compressedCount = 0;

        for (let i = 1; i <= numPages; i++) {
          uploadStatus.textContent = "Rendering page " + i + " of " + numPages + "...";
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({ canvasContext: context, viewport: viewport }).promise;

          const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));

          uploadStatus.textContent = "Uploading page " + i + " of " + numPages + "...";

          const formData = new FormData();
          formData.append("file", blob, `page_${i}.png`);

          const resp = await ctx.api("/upload/image", { method: "POST", body: formData });
          const bgUrl = `url('${resp.url}')`;

          if (resp.url.toLowerCase().endsWith(".webp") || resp.url.toLowerCase().includes(".webp")) {
            compressedCount++;
          }

          onPageAdded({
            label: "Page " + (ctx.ui.editingPages.length + 1),
            bg: bgUrl
          });
        }
        let compInfo = compressedCount > 0 ? " (Compressed to WebP)" : " (Original format)";
        uploadStatus.textContent = "Extracted " + numPages + " page(s) from " + file.name + compInfo;
      } catch (err) {
        console.error(err);
        uploadStatus.textContent = "Extraction failed: " + err.message;
      }
    } else {
      uploadStatus.textContent = "PDF.js library is not loaded.";
    }
  };
  reader.readAsArrayBuffer(file);
}

export async function importComicImages(files, ctx, uploadStatus, onPageAdded) {
  if (!files || !files.length) return;
  uploadStatus.textContent = "Uploading images...";
  let compressedCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    uploadStatus.textContent = "Uploading image " + (i + 1) + " of " + files.length + "...";
    const formData = new FormData();
    formData.append("file", file);
    try {
      const resp = await ctx.api("/upload/image", { method: "POST", body: formData });
      const bgUrl = `url('${resp.url}')`;

      if (resp.url.toLowerCase().endsWith(".webp") || resp.url.toLowerCase().includes(".webp")) {
        compressedCount++;
      }

      onPageAdded({
        label: "Page " + (ctx.ui.editingPages.length + 1),
        bg: bgUrl
      });
    } catch (err) {
      console.error(err);
      ctx.notify("Failed to upload " + file.name);
    }
  }
  let compInfo = compressedCount > 0 ? " (Compressed to WebP)" : " (Original format)";
  uploadStatus.textContent = "Uploaded " + files.length + " image(s) successfully" + compInfo;
}

export function importTextFile(file, uploadStatus, onLoadParagraphs) {
  if (!file) return;
  uploadStatus.textContent = "Processing " + file.name + "...";

  const reader = new FileReader();
  if (file.name.endsWith(".txt")) {
    reader.onload = function (evt) {
      const text = evt.target.result;
      const paras = text ? text.split(/\n\s*\n/) : [];
      onLoadParagraphs(paras.map(p => p.trim()));
      uploadStatus.textContent = "Extracted text from " + file.name;
    };
    reader.readAsText(file);
  } else if (file.name.endsWith(".docx")) {
    reader.onload = function (evt) {
      const arrayBuffer = evt.target.result;
      if (window.mammoth) {
        window.mammoth.extractRawText({ arrayBuffer: arrayBuffer })
          .then(function (result) {
            const paras = result.value ? result.value.split(/\n\s*\n/) : [];
            onLoadParagraphs(paras.map(p => p.trim()));
            uploadStatus.textContent = "Extracted text from " + file.name;
          })
          .catch(function (err) {
            console.error(err);
            uploadStatus.textContent = "Extraction failed: " + err.message;
          });
      } else {
        uploadStatus.textContent = "Mammoth.js library is not loaded.";
      }
    };
    reader.readAsArrayBuffer(file);
  } else if (file.name.endsWith(".pdf")) {
    reader.onload = function (evt) {
      const arrayBuffer = evt.target.result;
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "js/vendor/pdf.worker.min.js";
        window.pdfjsLib.getDocument({ data: arrayBuffer }).promise
          .then(function (pdf) {
            const numPages = pdf.numPages;
            const pagePromises = [];
            for (let i = 1; i <= numPages; i++) {
              pagePromises.push(
                pdf.getPage(i).then(function (page) {
                  return page.getTextContent().then(function (textContent) {
                    const lastItems = [];
                    textContent.items.forEach(function (item) {
                      lastItems.push(item.str);
                    });
                    return lastItems.join(" ");
                  });
                })
              );
            }
            return Promise.all(pagePromises);
          })
          .then(function (pageTexts) {
            const fullText = pageTexts.join("\n\n");
            const paras = fullText ? fullText.split(/\n\s*\n/) : [];
            onLoadParagraphs(paras.map(p => p.trim()).filter(Boolean));
            uploadStatus.textContent = "Extracted text from " + file.name;
          })
          .catch(function (err) {
            console.error(err);
            uploadStatus.textContent = "Extraction failed: " + err.message;
          });
      } else {
        uploadStatus.textContent = "PDF.js library is not loaded.";
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    uploadStatus.textContent = "Unsupported file format.";
  }
}
