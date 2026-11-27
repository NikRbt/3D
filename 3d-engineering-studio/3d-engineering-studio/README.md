# 3D Engineering Studio

KI-Quellcode (three.js) einfügen, auf "3D ausführen" klicken, Modell ansehen.

## Starten (Windows)
Voraussetzung: Node.js installiert. Dann in den Ordner gehen und `start.bat` doppelklicken
(oder `npm install` und danach `npm start`).

## Bedienung
- Strg+Enter: 3D ausführen, Strg+S: speichern
- "KI-Anweisung kopieren": Text für die KI, damit sie passenden Code liefert
- Im Code vorhanden: `THREE`, `scene` (leere Gruppe), `onFrame((dt, t) => {...})`, `console`
- Fehler erscheinen unten und als rote Markierung im Editor, F12 öffnet die Entwicklerkonsole

## Entwicklungsplan
| Version | Inhalt |
| ------- | ------ |
| V1.0 | Editor, 3D-Ansicht, Kamera, Fehleranzeige, Beispiele, Öffnen/Speichern, einfache Animation |
| V1.1 | Projektverwaltung (mehrere Modelle, Zuletzt geöffnet) |
| V1.2 | Export STL, OBJ, GLB |
| V1.3 | Modellbaum: Bauteile auswählen, ein- und ausblenden, Maße anzeigen |
| V2.0 | Erweiterte Animation und einfache Simulation (Zeitsteuerung, Parameter-Regler) |
| V2.1 | Windows-Installer (.exe) |
