// PDF.js library
const pdfjsLib = window['pdfjs-dist/build/pdf'];

// The workerSrc property should be specified.
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.9.359/pdf.worker.min.js';

let pdfDoc = null,
    pageNum = 1,
    pageRendering = false,
    pageNumPending = null,
    scale = 1.5,
    canvas = document.getElementById('pdf-canvas'),
    ctx = canvas.getContext('2d');

let currentPageIndex = 0,
    matchesFound = [],
    currentMatch = 0;

function renderPage(num) {
  pageRendering = true;
  pdfDoc.getPage(num).then(function(page) {
    let viewport = page.getViewport({scale: scale});
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    let renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };
    let renderTask = page.render(renderContext);

    renderTask.promise.then(function() {
      pageRendering = false;
      if (pageNumPending !== null) {
        renderPage(pageNumPending);
        pageNumPending = null;
      }
    });

    page.getTextContent().then(function(textContent) {
      if (document.getElementById('text-layer')) {
        document.getElementById('text-layer').remove();
      }

      let textLayer = document.createElement('div');
      textLayer.setAttribute('id', 'text-layer');
      textLayer.style.position = 'absolute';
      textLayer.style.left = canvas.offsetLeft + 'px';
      textLayer.style.top = canvas.offsetTop + 'px';
      textLayer.style.height = canvas.height + 'px';
      textLayer.style.width = canvas.width + 'px';

      document.querySelector('.pdf-viewer').appendChild(textLayer);

      pdfjsLib.renderTextLayer({
        textContent: textContent,
        container: textLayer,
        viewport: viewport,
        textDivs: []
      });

      addTooltipListeners();
    });
  });

  document.getElementById('page_num').textContent = num;
}

function queueRenderPage(num) {
  if (pageRendering) {
    pageNumPending = num;
  } else {
    renderPage(num);
  }
}

function onPrevPage() {
  if (pageNum <= 1) {
    return;
  }
  pageNum--;
  queueRenderPage(pageNum);
}

function onNextPage() {
  if (pageNum >= pdfDoc.numPages) {
    return;
  }
  pageNum++;
  queueRenderPage(pageNum);
}

function highlightMatches(matches) {
  console.log('Highlighting matches:', matches);
  let textLayer = document.getElementById('text-layer');
  if (!textLayer) {
    console.error('Text layer not found');
    return;
  }
  let textDivs = textLayer.querySelectorAll('span');
  console.log('Number of text divs:', textDivs.length);
  
  textDivs.forEach((textDiv) => {
    textDiv.classList.remove('highlight');
  });

  matches.forEach((match) => {
    if (textDivs[match.begin.divIdx]) {
      textDivs[match.begin.divIdx].classList.add('highlight');
      console.log('Added highlight to:', textDivs[match.begin.divIdx]);
    } else {
      console.log('Could not find element for match:', match);
    }
  });
}

function scrollToMatch(match) {
  let textLayer = document.getElementById('text-layer');
  let textDivs = textLayer.querySelectorAll('span');
  
  if (textDivs[match.begin.divIdx]) {
    textDivs[match.begin.divIdx].scrollIntoView({behavior: 'smooth', block: 'center'});
  }
}

function displaySearchResults(matches) {
  let resultsDiv = document.getElementById('search-results');
  resultsDiv.innerHTML = '';

  if (matches.length === 0) {
    resultsDiv.innerHTML = 'No matches found.';
    return;
  }

  let resultsList = document.createElement('ul');
  matches.forEach((match, index) => {
    let listItem = document.createElement('li');
    listItem.innerHTML = `
      <strong>Match ${index + 1} (Page ${match.pageNum}):</strong>
      <div class="match-context">${match.snippet}</div>
    `;
    listItem.addEventListener('click', () => {
      currentMatch = index;
      pageNum = match.pageNum;
      queueRenderPage(pageNum);
      setTimeout(() => {
        highlightMatches([match]);
        scrollToMatch(match);
      }, 100);
    });
    resultsList.appendChild(listItem);
  });

  resultsDiv.appendChild(resultsList);

  let navigationDiv = document.createElement('div');
  navigationDiv.innerHTML = `
    <button id="prev-match">Previous Match</button>
    <button id="next-match">Next Match</button>
  `;
  resultsDiv.appendChild(navigationDiv);

  document.getElementById('prev-match').addEventListener('click', () => {
    if (currentMatch > 0) {
      currentMatch--;
      let match = matchesFound[currentMatch];
      pageNum = match.pageNum;
      queueRenderPage(pageNum);
      setTimeout(() => {
        highlightMatches([match]);
        scrollToMatch(match);
      }, 100);
    }
  });

  document.getElementById('next-match').addEventListener('click', () => {
    if (currentMatch < matchesFound.length - 1) {
      currentMatch++;
      let match = matchesFound[currentMatch];
      pageNum = match.pageNum;
      queueRenderPage(pageNum);
      setTimeout(() => {
        highlightMatches([match]);
        scrollToMatch(match);
      }, 100);
    }
  });
}

function searchPDF() {
  const searchTerm = document.getElementById('search-input').value;
  if (searchTerm === '') return;

  console.log('Searching for:', searchTerm);
  matchesFound = [];
  currentMatch = 0;

  let loadingTask = pdfjsLib.getDocument(pdfUrl);
  loadingTask.promise.then(function(pdf) {
    let maxPages = pdf.numPages;
    let countPromises = [];
    for (let j = 1; j <= maxPages; j++) {
      let page = pdf.getPage(j);

      let txt = "";
      countPromises.push(page.then(function(page) {
        let textContent = page.getTextContent();
        return textContent.then(function(text) {
          return {page: j, items: text.items};
        });
      }));
    }

    Promise.all(countPromises).then(function(texts) {
      texts.forEach(function(pageText) {
        let pageContent = pageText.items.map(item => item.str).join(' ');
        let regex = new RegExp(searchTerm, 'gi');
        let match;
        while ((match = regex.exec(pageContent)) !== null) {
          let startIndex = Math.max(0, match.index - 20);
          let endIndex = Math.min(pageContent.length, match.index + searchTerm.length + 20);
          let snippet = pageContent.substring(startIndex, endIndex);
          matchesFound.push({
            pageNum: pageText.page,
            begin: {divIdx: match.index},
            end: {divIdx: match.index + searchTerm.length},
            snippet: '...' + snippet + '...'
          });
        }
      });

      console.log('Matches found:', matchesFound);

      if (matchesFound.length > 0) {
        pageNum = matchesFound[0].pageNum;
        queueRenderPage(pageNum);
        setTimeout(() => {
          highlightMatches(matchesFound);
          scrollToMatch(matchesFound[0]);
        }, 100);
      }

      displaySearchResults(matchesFound);
    });
  });
}

function addTooltipListeners() {
  console.log('Adding tooltip listeners');
  let textLayer = document.getElementById('text-layer');
  if (!textLayer) {
    console.error('Text layer not found');
    return;
  }
  let tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.style.display = 'none';
  document.querySelector('.pdf-viewer').appendChild(tooltip);

  textLayer.addEventListener('mouseover', (e) => {
    console.log('Mouseover event triggered');
    if (e.target.classList.contains('highlight')) {
      console.log('Highlighted element hovered');
      let rect = e.target.getBoundingClientRect();
      let pdfViewer = document.querySelector('.pdf-viewer');
      let pdfViewerRect = pdfViewer.getBoundingClientRect();
      tooltip.style.left = (rect.left - pdfViewerRect.left) + 'px';
      tooltip.style.top = (rect.bottom - pdfViewerRect.top) + 'px';
      tooltip.textContent = `Search term: "${document.getElementById('search-input').value}"`;
      tooltip.style.display = 'block';
    }
  });

  textLayer.addEventListener('mouseout', (e) => {
    console.log('Mouseout event triggered');
    if (e.target.classList.contains('highlight')) {
      tooltip.style.display = 'none';
    }
  });
}

function downloadPDF() {
  const downloadUrl = pdfUrl;
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = 'societygirl-doc.pdf';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

pdfjsLib.getDocument(pdfUrl).promise.then(function(pdf) {
  pdfDoc = pdf;
  document.getElementById('page_count').textContent = pdf.numPages;
  renderPage(pageNum);
});

document.getElementById('prev').addEventListener('click', onPrevPage);
document.getElementById('next').addEventListener('click', onNextPage);
document.getElementById('search-button').addEventListener('click', searchPDF);
document.getElementById('download-pdf').addEventListener('click', downloadPDF);
