import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function escapeXmlText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeXmlAttribute(value) {
  return escapeXmlText(value).replaceAll('"', "&quot;");
}

class TestElement {
  constructor(name) {
    this.attributes = new Map();
    this.childNodes = [];
    this.nodeName = name;
    this.parentNode = null;
    this.style = {};
    this.text = "";
  }

  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  getAttribute(name) {
    return this.attributes.get(String(name)) ?? null;
  }

  getBBox() {
    return { height: 0, width: 0, x: 0, y: 0 };
  }

  insertBefore(child, reference) {
    const referenceIndex = this.childNodes.indexOf(reference);
    child.parentNode = this;
    this.childNodes.splice(
      referenceIndex < 0 ? this.childNodes.length : referenceIndex,
      0,
      child,
    );
    return child;
  }

  removeChild(child) {
    const childIndex = this.childNodes.indexOf(child);
    if (childIndex >= 0) {
      this.childNodes.splice(childIndex, 1);
    }
    child.parentNode = null;
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  setAttributeNS(_namespace, name, value) {
    this.setAttribute(name, value);
  }

  get firstChild() {
    return this.childNodes[0] ?? null;
  }

  get textContent() {
    return this.text + this.childNodes.map((child) => child.textContent ?? "").join("");
  }

  set textContent(value) {
    this.childNodes = [];
    this.text = String(value);
  }
}

class RawTestElement extends TestElement {
  constructor(rawXml) {
    super("svg");
    this.rawXml = rawXml.slice(rawXml.indexOf("<svg"));
    this.tagName = "svg";
  }
}

class TestHeadElement extends TestElement {
  constructor(baseUrl) {
    super("head");
    this.baseUrl = baseUrl;
  }

  appendChild(child) {
    const result = super.appendChild(child);
    if (child.nodeName === "script") {
      try {
        const scriptUrl = new URL(String(child.src), this.baseUrl);
        Function(readFileSync(fileURLToPath(scriptUrl), "utf8"))();
        child.onload?.();
      } catch (error) {
        child.onerror?.(error);
      }
    }
    return result;
  }
}

function serializeElement(element) {
  if (element instanceof RawTestElement) {
    return element.rawXml;
  }
  const attributes = [...element.attributes]
    .map(([name, value]) => ` ${name}="${escapeXmlAttribute(value)}"`)
    .join("");
  const content = escapeXmlText(element.text)
    + element.childNodes.map(serializeElement).join("");
  return `<${element.nodeName}${attributes}>${content}</${element.nodeName}>`;
}

const originalConsoleLog = console.log;
const testLocation = {
  href: new URL("../node_modules/@plantuml/core/viz-global.js", import.meta.url).href,
};
const stdlibBaseUrl = new URL("../vendor/plantuml-stdlib/", import.meta.url).href;
const canvasContext = {
  createImageData(width, height) {
    return {
      data: new Uint8ClampedArray(Number(width) * Number(height) * 4),
      height: Number(height),
      width: Number(width),
    };
  },
  font: "",
  measureText(text) {
    return {
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 3,
      width: Array.from(String(text)).length * 7.2,
    };
  },
  putImageData() {},
};

globalThis.window = globalThis;
globalThis.location = testLocation;
globalThis.document = {
  baseURI: stdlibBaseUrl,
  body: new TestElement("body"),
  createElement(name) {
    if (name === "canvas") {
      return {
        getContext: () => canvasContext,
        style: {},
        toDataURL: () => "data:image/png;base64,iVBORw0KGgo=",
      };
    }
    return new TestElement(name);
  },
  createElementNS(_namespace, name) {
    return new TestElement(name);
  },
  currentScript: null,
  getElementById() {
    return null;
  },
  head: new TestHeadElement(stdlibBaseUrl),
  importNode(element) {
    return element;
  },
};
globalThis.DOMParser = class TestDomParser {
  parseFromString(source) {
    return { documentElement: new RawTestElement(String(source)) };
  }
};
globalThis.XMLSerializer = class TestXmlSerializer {
  serializeToString(element) {
    return serializeElement(element);
  }
};

console.log = () => {};
await import("../node_modules/@plantuml/core/viz-global.js");
const { renderToString } = await import("../node_modules/@plantuml/core/plantuml.js");

export async function renderPlantUmlTestSource(source, dark) {
  return new Promise((resolve, reject) => {
    const outputs = [];
    let idleTimeout = null;
    renderToString(source.split(/\r\n|\r|\n/u), (svg) => {
      outputs.push(String(svg));
      if (idleTimeout !== null) {
        clearTimeout(idleTimeout);
      }
      idleTimeout = setTimeout(() => resolve(outputs), 25);
    }, reject, { dark });
  });
}

const samples = [
  {
    expectedText: "hello",
    dark: false,
    name: "sequence",
    source: "@startuml\nAlice -> Bob: hello\n@enduml",
  },
  {
    expectedText: "Receive request",
    dark: true,
    name: "activity",
    source: [
      "@startuml",
      "start",
      ":Receive request;",
      "if (Valid?) then (yes)",
      "  :Process request;",
      "else (no)",
      "  :Reject request;",
      "endif",
      "stop",
      "@enduml",
    ].join("\n"),
  },
  {
    expectedText: "Return success",
    dark: false,
    name: "activity-legacy",
    source: [
      "@startuml",
      "(*) --> \"Receive request\"",
      "if \"Valid?\" then",
      "  -->[yes] \"Process request\"",
      "  --> \"Return success\"",
      "  --> (*)",
      "else",
      "  -->[no] \"Return error\"",
      "  --> (*)",
      "endif",
      "@enduml",
    ].join("\n"),
  },
  {
    expectedText: "Receive signal",
    dark: false,
    name: "sdl",
    source: [
      "@startuml",
      "start",
      ":Receive signal; <<input>>",
      ":Validate data; <<procedure>>",
      "stop",
      "@enduml",
    ].join("\n"),
  },
  {
    expectedText: "OrderService",
    dark: false,
    name: "class",
    source: [
      "@startuml",
      "class OrderService",
      "class OrderRepository",
      "OrderService --> OrderRepository",
      "@enduml",
    ].join("\n"),
  },
  {
    expectedText: "Child",
    dark: true,
    name: "mindmap",
    source: "@startmindmap\n* Root\n** Child\n@endmindmap",
  },
  {
    expectedText: "Sample System",
    dark: false,
    name: "c4-stdlib",
    source: [
      "@startuml",
      "!include <C4/C4_Container>",
      "title C4 Container Diagram",
      "Person(user, \"User\", \"Uses the system\")",
      "System_Boundary(system, \"Sample System\") {",
      "  Container(web, \"Web Application\", \"TypeScript\", \"User interface\")",
      "}",
      "Rel(user, web, \"Uses\")",
      "@enduml",
    ].join("\n"),
  },
];

export const renderedPlantUmlSamples = [];

for (const sample of samples) {
  const outputs = await renderPlantUmlTestSource(sample.source, sample.dark);
  const svg = outputs.join("\n");
  assert.match(svg, /^<svg\b/u, `${sample.name} must return SVG`);
  assert.ok(svg.includes(sample.expectedText), `${sample.name} text is missing`);
  assert.ok(!svg.includes("$version$"), `${sample.name} rendered a version placeholder`);
  assert.ok(!svg.includes("$git.commit.id$"), `${sample.name} rendered a commit placeholder`);
  renderedPlantUmlSamples.push({ name: sample.name, svg });
}

console.log = originalConsoleLog;
console.log(`PlantUML rendering samples: OK (${samples.length})`);
