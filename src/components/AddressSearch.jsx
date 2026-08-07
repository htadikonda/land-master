import { useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { normalizePlace } from '../lib/placeParse.js';

const PLACE_FIELDS = ['formattedAddress', 'location', 'addressComponents'];

/**
 * Address input with Google Places autocomplete.
 *
 * Three tiers, because which Places surface a key can use depends on when the
 * Cloud project was created:
 *
 *   1. `PlaceAutocompleteElement` — Places API (New). The only option for
 *      projects created after March 2025, so it is tried first.
 *   2. `places.Autocomplete` — the legacy widget, still enabled on older keys.
 *   3. A plain input — no Places at all. Submitting runs the Census one-line
 *      geocoder, which still yields coordinates, tract and flood data.
 */
export default function AddressSearch({ onSelect, onNotice }) {
  const places = useMapsLibrary('places');
  const hostRef = useRef(null);
  const inputRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const onNoticeRef = useRef(onNotice);
  const [mode, setMode] = useState('loading');

  // Keep the latest callbacks reachable without re-running the setup effect,
  // which would tear down and rebuild the Google widget on every render.
  useEffect(() => {
    onSelectRef.current = onSelect;
    onNoticeRef.current = onNotice;
  }, [onSelect, onNotice]);

  useEffect(() => {
    if (!places) return undefined;

    const emit = (place) => {
      const normalized = normalizePlace(place);
      if (!normalized) {
        onNoticeRef.current?.('That suggestion had no location attached. Try another.');
        return;
      }
      onSelectRef.current?.(normalized);
    };

    if (typeof places.PlaceAutocompleteElement === 'function' && hostRef.current) {
      let element;
      try {
        element = new places.PlaceAutocompleteElement({ includedRegionCodes: ['us'] });
      } catch (error) {
        // Fall through to the legacy widget below.
        element = null;
      }

      if (element) {
        element.id = 'address-autocomplete';
        element.className = 'lm-autocomplete-element';
        hostRef.current.replaceChildren(element);
        setMode('element');

        const handleSelect = async (event) => {
          try {
            const place = event.placePrediction ? event.placePrediction.toPlace() : event.place;
            if (!place) return;
            await place.fetchFields({ fields: PLACE_FIELDS });
            emit(place);
          } catch (error) {
            onNoticeRef.current?.(`Places lookup failed: ${error.message}`);
          }
        };

        // `gmp-select` is current; `gmp-placeselect` was the earlier name and is
        // still what some released weekly versions emit.
        element.addEventListener('gmp-select', handleSelect);
        element.addEventListener('gmp-placeselect', handleSelect);

        return () => {
          element.removeEventListener('gmp-select', handleSelect);
          element.removeEventListener('gmp-placeselect', handleSelect);
          element.remove();
        };
      }
    }

    if (typeof places.Autocomplete === 'function' && inputRef.current) {
      const autocomplete = new places.Autocomplete(inputRef.current, {
        fields: ['formatted_address', 'geometry.location', 'address_components'],
        componentRestrictions: { country: 'us' },
        types: ['address'],
      });
      setMode('legacy');

      const listener = autocomplete.addListener('place_changed', () => {
        emit(autocomplete.getPlace());
      });

      return () => {
        listener?.remove?.();
        window.google?.maps?.event?.clearInstanceListeners?.(autocomplete);
      };
    }

    setMode('manual');
    onNoticeRef.current?.(
      'Places autocomplete is unavailable for this key — type a full address and press Enter.',
    );
    return undefined;
  }, [places]);

  const handleManualSubmit = (event) => {
    event.preventDefault();
    const value = (inputRef.current?.value || '').trim();
    if (!value) return;
    // No Places geometry here; the Census geocoder supplies the coordinates.
    onSelectRef.current?.({
      formattedAddress: value,
      lat: null,
      lng: null,
      components: { street: '', city: '', state: '', zip: '' },
    });
  };

  return (
    <form className="search" role="search" onSubmit={handleManualSubmit}>
      <label className="search__label" htmlFor="address-autocomplete">
        Property address
      </label>

      <div className="search__field">
        <span className="search__glyph" aria-hidden="true">
          ⌖
        </span>

        {/* Google's web component mounts here when Places API (New) is available. */}
        <div ref={hostRef} className="search__host" hidden={mode !== 'element'} />

        {/*
          Uncontrolled on purpose: in legacy mode Google writes the chosen
          address straight into this node without firing React's onChange, so a
          controlled value would fight the widget.
        */}
        <input
          ref={inputRef}
          id={mode === 'element' ? 'address-autocomplete-fallback' : 'address-autocomplete'}
          className="search__input"
          type="text"
          name="address"
          autoComplete="off"
          spellCheck="false"
          placeholder={
            mode === 'loading' ? 'Loading Places…' : 'Search a US address — street, city, state'
          }
          disabled={mode === 'loading'}
          hidden={mode === 'element'}
        />

        {mode === 'manual' && (
          <button className="search__submit" type="submit">
            Look up
          </button>
        )}
      </div>

      <p className="search__hint">
        {mode === 'manual'
          ? 'Autocomplete unavailable — enter a full street address.'
          : 'Start typing, then pick a suggestion.'}
      </p>
    </form>
  );
}
