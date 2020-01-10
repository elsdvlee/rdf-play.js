import {StreamWriter} from "n3";
import * as RDF from "rdf-js";
import {stringQuadToQuad} from "rdf-string";

function invoke(url: string, proxy: string, onQuad: (quad: RDF.Quad) => void, onError: (error: string) => void,
                onCounterUpdate: (counter: number, done: boolean) => void): Worker {
  const worker = new Worker('scripts/worker.min.js');
  worker.onmessage = (message) => {
    const data = message.data;
    switch (data.type) {
    case 'quad':    return onQuad(stringQuadToQuad(data.quad));
    case 'err':   return onError(data.error);
    case 'counter': return onCounterUpdate(data.counter, data.done);
    }
  };
  worker.onerror = <any> onError;
  worker.postMessage({ url, proxy });
  return worker;
}

function termToHtml(term: RDF.Term): string {
  switch (term.termType) {
  case 'NamedNode':
    return `<a href="${term.value}" target="_blank">${term.value}</a>`;
  case 'BlankNode':
    return `_:${term.value}`;
  case 'Literal':
    return term.value + ` <br /><em>(${term.datatype ? termToHtml(term.datatype) : term.language})</em>`;
  default:
    return term.value;
  }
}

function createTablePrinter(): (quad: RDF.Quad) => void {
  const table: HTMLTableElement = document.querySelector('.output table.quads');

  // Clear old results
  table.querySelectorAll('.row-result')
    .forEach((row) => row.parentNode.removeChild(row));

  return (quad: RDF.Quad) => {
    const row = table.insertRow(1);
    row.classList.add('row-result');
    const cellS = row.insertCell(0);
    const cellP = row.insertCell(1);
    const cellO = row.insertCell(2);
    const cellG = row.insertCell(3);
    cellS.innerHTML = termToHtml(quad.subject);
    cellP.innerHTML = termToHtml(quad.predicate);
    cellO.innerHTML = termToHtml(quad.object);
    cellG.innerHTML = termToHtml(quad.graph);
  };
}

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/ /g, "&nbsp;");
}

function createTrigPrinter(): (quad: RDF.Quad) => void {
  const container: HTMLTableElement = document.querySelector('.output table.serialized');

  // Clear old results
  container.querySelectorAll('.row-result')
    .forEach((row) => row.parentNode.removeChild(row));

  const writer = new StreamWriter({ format: 'trig' });
  let i = 0;
  let lastElement: HTMLTableDataCellElement = null;
  writer.on('data', (text: string) => {
    lastRdf += text;
    const lines = text.split(/\n/g);
    let first = true;
    for (const line of lines) {
      let element = lastElement;
      if (!element || !first) {
        const row = container.insertRow(i++);
        row.classList.add('row-result');
        element = row.insertCell(0);
      }
      first = false;
      element.innerHTML += escapeHtml(line);
      lastElement = element;
    }
  });

  return (quad: RDF.Quad) => {
    writer.write(<any> quad);
  };
}

function copyStringToClipboard(str: string) {
  // Create new element
  const el: HTMLTextAreaElement = document.createElement('textarea');
  // Set value (string to be copied)
  el.value = str;
  // Set non-editable to avoid focus and move outside of view
  el.setAttribute('readonly', '');
  (<any> el).style = { position: 'absolute', left: '-9999px' };
  document.body.appendChild(el);
  // Select text inside element
  el.select();
  // Copy text to clipboard
  document.execCommand('copy');
  // Remove temporary element
  document.body.removeChild(el);
}

let lastRdf: string;
function init() {
  let lastWorker: Worker = null;

  // Load URL state
  const uiState = location.hash.substr(1).split('&').reduce((acc: any, item) => {
    const keyvalue = item.match(/^([^=]+)=(.*)/);
    if (keyvalue) {
      acc[decodeURIComponent(keyvalue[1])] = decodeURIComponent(keyvalue[2]);
    }
    return acc;
  }, {});

  // Init form(s)
  const forms = document.querySelectorAll('.query');
  for (let i = 0; i < forms.length; i++) {
    const form = forms.item(i);

    const httpProxyElement: HTMLInputElement = document.querySelector('.http-proxy');

    form.addEventListener('submit', (event) => {
      lastRdf = '';

      const outputElement: HTMLElement = document.querySelector('.output');
      const counterElement: HTMLElement = document.querySelector('.output-counter');
      const errorElement: HTMLElement = document.querySelector('.output-error');

      // Hide error
      errorElement.style.display = 'none';
      outputElement.style.display = 'block';

      // Kill any old worker
      if (lastWorker) {
        lastWorker.terminate();
      }

      // Add new results
      const proxy = httpProxyElement.value;
      lastWorker = invoke((<any> form.querySelector('.field-url')).value,
        proxy,
        createTrigPrinter(),
        (error) => {
          errorElement.style.display = 'block';
          errorElement.innerHTML = error;
          if (error.indexOf('Error requesting') === 0) {
            errorElement.innerHTML += `<br /><em>This website may not have CORS enabled, try enabling a proxy in the settings (button next to input field).</em>`;
          }
        },
        (counter: number, done: boolean) => {
          counterElement.innerHTML = `${counter}${done ? '' : '...'}`;
        });

      event.preventDefault();
      return false;
    }, true);

    // Copy clipboard listener
    document.querySelector('.clipboard').addEventListener('click', () => {
      copyStringToClipboard(lastRdf);
      event.preventDefault();
      return false;
    });

    // Set up details toggling
    const details: HTMLElement = document.querySelector('.details');
    document.querySelector('.details-toggle').addEventListener('click', () => {
      if (details.style.display === 'block') {
        details.style.display = 'none';
      } else {
        details.style.display = 'block';
      }
    });

    // Set default proxy
    document.querySelector('.proxy-default').addEventListener('click', () => {
      httpProxyElement.value = 'https://proxy.linkeddatafragments.org/';
      inputChangeListener();
      event.preventDefault();
    });

    // URL state
    const fieldUrl: HTMLInputElement = form.querySelector('.field-url');
    if (uiState.url) {
      fieldUrl.value = uiState.url;
    }
    if (uiState.proxy) {
      httpProxyElement.value = uiState.proxy;
    }
    const inputChangeListener = () => {
      const queryString: string[] = [];
      if (fieldUrl.value) {
        queryString.push('url=' + encodeURIComponent(fieldUrl.value));
      }
      if (httpProxyElement.value) {
        queryString.push('proxy=' + encodeURIComponent(httpProxyElement.value));
      }
      history.replaceState(null, null, location.href.replace(/(?:#.*)?$/,
        queryString.length ? '#' + queryString.join('&') : ''));
    };
    fieldUrl.addEventListener('input', inputChangeListener);
    httpProxyElement.addEventListener('input', inputChangeListener);
  }
}

init();
