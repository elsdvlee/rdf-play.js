import {StreamWriter} from "n3";
import * as RDF from "rdf-js";
import {stringQuadToQuad} from "rdf-string";

function invoke(url: string, onQuad: (quad: RDF.Quad) => void, onError: (error: Error) => void,
                onCounterUpdate: (counter: number, done: boolean) => void): Worker {
  const worker = new Worker('scripts/worker.min.js');
  worker.onmessage = (message) => {
    const data = message.data;
    switch (data.type) {
    case 'quad':    return onQuad(stringQuadToQuad(data.quad));
    case 'error':   return onError(data.error);
    case 'counter': return onCounterUpdate(data.counter, data.done);
    }
  };
  worker.onerror = <any> onError;
  worker.postMessage({ url });
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

function init() {
  let lastWorker: Worker = null;

  const forms = document.querySelectorAll('.query');
  for (let i = 0; i < forms.length; i++) {
    const form = forms.item(i);

    form.addEventListener('submit', (event) => {
      const counterElement = document.querySelector('.output-counter');
      const errorElement = document.querySelector('.output-error');

      // Kill any old worker
      if (lastWorker) {
        lastWorker.terminate();
      }

      // Add new results
      lastWorker = invoke((<any> form.querySelector('.field-url')).value,
        createTrigPrinter(),
        (error) => {
          errorElement.innerHTML = error.message;
        },
        (counter: number, done: boolean) => {
          counterElement.innerHTML = `${counter}${done ? '' : '...'}`;
        });
      event.preventDefault();
      return false;
    }, true);
  }
}

init();
