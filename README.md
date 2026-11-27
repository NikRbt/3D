# 3D Engineering Studio

KI-Quellcode (three.js) einfügen, auf "3D ausführen" klicken, Modell ansehen.

## Starten (Windows)
Voraussetzung: Node.js installiert. Dann in den Ordner gehen und `start.bat` doppelklicken
(oder `npm install` und danach `npm start`).

## Bedienung
- Strg+Enter: 3D ausführen, Strg+S: speichern
- Kameraansicht: Modell von vorne, rechts, oben oder isometrisch betrachten; "Ansicht anpassen" zentriert das Modell
- Modellierungsmodus: Adaptiv, Organisch, Realistisch oder Engineering; einzelne Gruppen und Bauteile können im Modellcode eigene Modi erhalten
- Qualität: Niedrig, Mittel, Hoch, Ultra oder Adaptiv; adaptive Qualität richtet Geometriedetails nach Bauteil und Polygonzahl aus. Die Auswahl gilt für neue Modellläufe
- Geometrieoptimierung: ungültige Vertex-Koordinaten werden gemeldet, degenerierte Dreiecke erkannt, fehlende/fehlerhafte Normalen repariert und niedrig aufgelöste organische Flächen bei Bedarf mit begrenzter Loop-Subdivision verfeinert. Engineering-Kanten werden nicht pauschal geglättet
- PBR-Darstellung: MeshStandardMaterial/MeshPhysicalMaterial mit Studioumgebung für Materialreflexionen und dynamisch gewählter Schatten- und Texturqualität
- Darstellung: Raster, Achsen und Drahtgitter sind in der gruppierten Darstellungsauswahl; Animationsoptionen sind separat angeordnet
- 3D-Steuerung: links drehen, rechts verschieben, Mausrad zoomen; "Kameraumlauf" dreht die Ansicht automatisch
- Animationstempo: 0,5× bis 2×; Animationen laufen standardmäßig mit zeitbasiertem `dt`
- Vollbild: Schaltfläche "Vollbild" oder Taste F
- Export: GLB (3D-Modell mit Materialien), STL (für 3D-Druck) oder PNG (Bild der aktuellen Ansicht) speichern
- Physik-Labor: Starrkörper mit Gravitation, Kollisionsformen, Reibung, Rückprall, Kräften, Impulsen, Drehmomenten, Federn und Pendel simulieren; Start/Pause, Einzelschritt und Zurücksetzen verwenden
- Messwerte: Simulationszeit, Kontakte, Positionen, Geschwindigkeiten sowie Bewegungs-, Lage-, Feder- und Gesamtenergie (SI-Einheiten)
- "KI-Anweisung kopieren": Text für die KI, damit sie passenden Code liefert
- Im Code vorhanden: `THREE`, `scene` (leere Gruppe), `onFrame((dt, t) => {...})`, `physics` und `console`
- Modellierungshelfer im Code: `modeling.assign(object, { mode, quality, subdivision, smooth })`, `modeling.material(options)` (MeshPhysicalMaterial), `modeling.roundedBox(width, height, depth, radius)` und `modeling.subdivide(mesh, levels)`
- `mode` ist `organic`, `realistic` oder `engineering`. Zuweisungen auf Gruppen werden vererbt; Mesh-Zuweisungen überschreiben sie. Nicht zugewiesene Teile werden über Namen und den ausgewählten Standardmodus klassifiziert.
- `physics.add(mesh, { mass, friction, restitution, linearDamping, angularDamping, name, animationDrive })` registriert Boxen, Kugeln, gleichmäßige Zylinder und Kapseln; `mass: 0` ist statisch, `animationDrive: false` schaltet die Übernahme von `onFrame`-Bewegungen aus
- Bewegungen und Drehungen aus `onFrame` werden bei registrierten dynamischen Körpern als weiche Antriebsziele in die Physik übernommen. Schwerkraft, Kräfte und Kollisionen können die Bewegung weiterhin verändern. Mit `animationDrive: false` lässt sich das für einzelne Körper deaktivieren; nicht registrierte Meshes bleiben rein visuell animiert. Die Antriebsarbeit aus dem Modellcode wird nicht separat in der Energiebilanz ausgewiesen.
- `physics.applyForce(mesh, force)` und `physics.applyTorque(mesh, torque)` wirken dauerhaft bis `clearForce(mesh)` bzw. `clearTorque(mesh)`; für einen einmaligen Stoß `applyImpulse(mesh, impulse)` verwenden. Federn, Pendel und Schwerkraft: `addSpring(mesh, null, { anchor, restLength, stiffness, damping })`, `addPendulum(mesh, { pivot })`, `setGravity(new THREE.Vector3(x, y, z))`
- Die Starrkörper-Simulation nutzt Bullet/Ammo mit festem Zeitschritt (1/120 s). Sie ist für Mechanik-Demos und nicht als verifizierter Ersatz für FEM, Strömungs-, Wärme- oder sicherheitskritische Ingenieursberechnungen gedacht.
- Fehler erscheinen unten und als rote Markierung im Editor, F12 öffnet die Entwicklerkonsole

## Entwicklungsplan
| Version | Inhalt |
| ------- | ------ |
| V1.0 | Editor, 3D-Ansicht, Kamera, Fehleranzeige, Beispiele, Öffnen/Speichern, einfache Animation |
| V1.1 | Projektverwaltung (mehrere Modelle, Zuletzt geöffnet) |
| V1.2 | Export STL, OBJ, GLB (erledigt in V1.0) |
| V1.3 | Modellbaum: Bauteile auswählen, ein- und ausblenden, Maße anzeigen |
| V2.0 | Erweiterte Simulationsanalyse (Messkurven, Parameter-Regler, Auswertung) |
| V2.1 | Windows-Installer (.exe) |
