import assert from "node:assert/strict";
import test from "node:test";

import { tightenMermaidSequenceMessageSpacing } from "../src/adapters/browser/browserMermaidSequence.ts";
import { normalizeMermaidLineBreakTags } from "../src/adapters/browser/browserMermaidSource.ts";

test("normalizes Mermaid line break tag variants", () => {
  assert.equal(
    normalizeMermaidLineBreakTags("<br><br/><br /></br></BR >"),
    "<br/><br/><br/><br/><br/>",
  );
});

test("normalizes malformed closing br tags inside diagram labels", () => {
  assert.equal(
    normalizeMermaidLineBreakTags("state1: line1</br>line2"),
    "state1: line1<br/>line2",
  );
});

test("makes Mermaid foreignObject line breaks XML-compatible", () => {
  assert.equal(
    normalizeMermaidLineBreakTags(
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">line1<br>line2</div></foreignObject></svg>',
    ),
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">line1<br/>line2</div></foreignObject></svg>',
  );
});

test("leaves escaped and unrelated tags unchanged", () => {
  const source = "&lt;/br&gt; <brake> </b> <br data-kind='manual'>";
  assert.equal(normalizeMermaidLineBreakTags(source), source);
});

function createSvgElement(className, attributes = {}, textContent = "") {
  const values = new Map(Object.entries(attributes));

  return {
    classList: { contains: (name) => name === className },
    style: { fontSize: values.get("font-size") ?? "" },
    textContent,
    getAttribute: (name) => values.get(name) ?? null,
    setAttribute: (name, value) => values.set(name, value),
  };
}

function createSvgRoot(elements, loops = [], actors = [], attributes = {}) {
  const values = new Map(Object.entries(attributes));

  return {
    getAttribute: (name) => values.get(name) ?? null,
    setAttribute: (name, value) => values.set(name, value),
    querySelectorAll(selector) {
      if (selector.startsWith("g[")) {
        return loops;
      }
      if (selector === ".messageText") {
        return elements.filter((element) => element.classList.contains("messageText"));
      }
      if (selector === ".messageLine0, .messageLine1") {
        return elements.filter((element) => !element.classList.contains("messageText"));
      }
      if (selector === ".actor-bottom, .actor-box, .actor-line") {
        return actors;
      }
      if (selector === "*") {
        return [
          ...elements,
          ...actors,
          ...loops.flatMap((loop) => loop.querySelectorAll(".loopLine")),
        ];
      }
      return elements;
    },
  };
}

test("keeps multiline sequence messages 8px above their arrows", () => {
  const createText = (y) => createSvgElement("messageText", {
    y: `${y}`,
    dy: "1em",
    "font-size": "16px",
  });
  const firstTexts = [80, 96, 112, 128].map(createText);
  const secondTexts = [170, 186].map(createText);
  const svg = createSvgRoot([
    ...firstTexts,
    createSvgElement("messageLine0", { y1: "155" }),
    ...secondTexts,
    createSvgElement("messageLine0", { y1: "213" }),
  ]);

  tightenMermaidSequenceMessageSpacing(svg);

  assert.equal(155 - (Number(firstTexts.at(-1).getAttribute("y")) + 16), 8);
  assert.equal(213 - (Number(secondTexts.at(-1).getAttribute("y")) + 16), 8);
});

test("does not move Mermaid text without a following sequence arrow", () => {
  const text = createSvgElement("messageText", { y: "128" });

  tightenMermaidSequenceMessageSpacing(createSvgRoot([text]));

  assert.equal(text.getAttribute("y"), "128");
});

test("compacts loop heading space without changing arrow or frame clearances", () => {
  const title = createSvgElement("loopText", { y: "241" });
  const frameLines = [
    createSvgElement("loopLine", { y1: "223", y2: "223" }),
    createSvgElement("loopLine", { y1: "223", y2: "352" }),
    createSvgElement("loopLine", { y1: "352", y2: "352" }),
    createSvgElement("loopLine", { y1: "223", y2: "352" }),
  ];
  const loop = {
    querySelector: (selector) => selector === ".labelText"
      ? createSvgElement("labelText", {}, "loop")
      : title,
    querySelectorAll: () => frameLines,
  };
  const firstText = createSvgElement("messageText", {
    y: "276",
    dy: "1em",
    "font-size": "16px",
  });
  const secondText = createSvgElement("messageText", {
    y: "318",
    dy: "1em",
    "font-size": "16px",
  });
  const firstArrow = createSvgElement("messageLine0", { y1: "300", y2: "300" });
  const secondArrow = createSvgElement("messageLine0", { y1: "342", y2: "342" });
  const followingText = createSvgElement("messageText", {
    y: "376",
    dy: "1em",
    "font-size": "16px",
  });
  const followingArrow = createSvgElement("messageLine0", { y1: "400", y2: "400" });
  const bottomActor = createSvgElement("actor-bottom", { y: "450" });
  const actorLine = createSvgElement("actor-line", { y1: "65", y2: "450" });
  const followingGap = Number(followingText.getAttribute("y")) - 352;

  const svg = createSvgRoot(
    [firstText, firstArrow, secondText, secondArrow, followingText, followingArrow],
    [loop],
    [bottomActor, actorLine],
    { viewBox: "-50 -10 450 500" },
  );
  tightenMermaidSequenceMessageSpacing(svg);

  assert.equal(Number(firstText.getAttribute("y")) + 16 - 241, 28);
  assert.equal(Number(firstArrow.getAttribute("y1")) - (Number(firstText.getAttribute("y")) + 16), 8);
  assert.equal(Number(frameLines[2].getAttribute("y1")) - Number(secondArrow.getAttribute("y1")), 10);
  assert.equal(Number(followingText.getAttribute("y")) - Number(frameLines[2].getAttribute("y1")), followingGap);
  assert.equal(bottomActor.getAttribute("y"), "427");
  assert.equal(actorLine.getAttribute("y2"), "427");
  assert.equal(svg.getAttribute("viewBox"), "-50 -10 450 477");
});
