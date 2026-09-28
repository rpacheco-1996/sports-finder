import { useEffect, useId, useState } from "react";
import { loadPlaces, placeLabel, searchPlaces } from "../lib/places";
import type { Place } from "../types";

export function PlaceSearch({
  selectedLabel,
  onSelect,
}: {
  selectedLabel: string;
  onSelect: (place: Place) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState(selectedLabel);
  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    setQuery(selectedLabel);
  }, [selectedLabel]);

  useEffect(() => {
    let cancel = false;
    loadPlaces()
      .then((next) => {
        if (!cancel) setPlaces(next);
      })
      .catch(() => {
        if (!cancel) setPlaces([]);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const matches = open ? searchPlaces(places, query) : [];

  function choose(place: Place) {
    setQuery(placeLabel(place));
    setOpen(false);
    onSelect(place);
  }

  return (
    <label className="field combo">
      <span>City or zip</span>
      <input
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Meridian or 83642"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => {
          if (query.trim().length >= 2) setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            const pick = matches[active];
            if (pick) choose(pick);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {matches.length > 0 && (
        <ul className="suggest" id={listId} role="listbox">
          {matches.map((place, index) => (
            <li key={`${place.zip}-${place.city}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                className={index === active ? "is-on" : ""}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(place)}
              >
                {placeLabel(place)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}
