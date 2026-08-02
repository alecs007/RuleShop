// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppearItem, AppearList } from "@/components/ui/appear";

/**
 * The list entrance is CSS, not JS, so these tests pin the contract with
 * `globals.css`: the class and the stagger variable. Change one without the
 * other and the cards stay invisible, since `.appear-item` starts at
 * `opacity: 0`.
 */

afterEach(cleanup);

const delayOf = (text: string) =>
  screen.getByText(text).style.getPropertyValue("--appear-delay");

describe("AppearItem", () => {
  it("poarta clasa pe care se sprijina animatia din CSS", () => {
    render(<AppearItem>continut</AppearItem>);
    expect(screen.getByText("continut").className).toBe("appear-item");
  });

  it("pastreaza clasele primite", () => {
    render(<AppearItem className="h-full">continut</AppearItem>);
    expect(screen.getByText("continut").className).toBe("appear-item h-full");
  });

  it("traduce pozitia in decalaj", () => {
    render(<AppearItem index={3}>continut</AppearItem>);
    expect(delayOf("continut")).toBe("75ms");
  });

  it("primul element nu are decalaj", () => {
    render(<AppearItem index={0}>continut</AppearItem>);
    expect(delayOf("continut")).toBe("0ms");
  });

  it("plafoneaza decalajul, ca ultimul card sa nu astepte o jumatate de secunda", () => {
    render(<AppearItem index={500}>continut</AppearItem>);
    expect(delayOf("continut")).toBe("200ms");
  });

  it("poate fi element de lista", () => {
    render(
      <ul>
        <AppearItem as="li">continut</AppearItem>
      </ul>,
    );
    expect(screen.getByText("continut").tagName).toBe("LI");
  });
});

describe("AppearList", () => {
  it("randeaza copiii", () => {
    render(
      <AppearList>
        <AppearItem index={0}>unu</AppearItem>
        <AppearItem index={1}>doi</AppearItem>
      </AppearList>,
    );
    expect(screen.getByText("unu")).toBeTruthy();
    expect(screen.getByText("doi")).toBeTruthy();
  });

  it("remonteaza copiii cand se schimba resetKey, ca animatia sa se redea", () => {
    const { rerender } = render(
      <AppearList resetKey="toate">
        <AppearItem>card</AppearItem>
      </AppearList>,
    );
    const first = screen.getByText("card");

    rerender(
      <AppearList resetKey="electronice">
        <AppearItem>card</AppearItem>
      </AppearList>,
    );

    expect(screen.getByText("card")).not.toBe(first);
  });

  it("pastreaza acelasi nod cand resetKey nu se schimba", () => {
    const { rerender } = render(
      <AppearList resetKey="toate">
        <AppearItem>card</AppearItem>
      </AppearList>,
    );
    const first = screen.getByText("card");

    rerender(
      <AppearList resetKey="toate">
        <AppearItem>card</AppearItem>
      </AppearList>,
    );

    expect(screen.getByText("card")).toBe(first);
  });
});
