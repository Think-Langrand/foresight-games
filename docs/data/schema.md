# Data schema

## `model.json` shape

Nested, one array of drivers. The explorer reads this directly.

```jsonc
{
  "drivers": [
    {
      "id": "recXX…",            // Airtable record id
      "name": "AI as Public Health Infrastructure",
      "theme": "The Data & AI Inflection",
      "headline": "…",            // the driver's one-line statement
      "short": "…",               // short description
      "neutralHeadline": "…",     // a neutral, non-doom reframing of the headline
      "neutralReading": "…",      // a neutral, non-doom reframing of the description
      "neutralName": "…",         // a neutral, non-doom reframing of the name; blank unless the current name was worth softening
      "topRight": true,            // flagged high-impact / high-uncertainty in the workshop
      "impact": "High",           // optional
      "uncertainty": "High",      // optional
      "uncertainties": [
        {
          "id": "recXXX…",
          "label": "Governed vs ungoverned AI",
          "question": "…",         // the full open question
          "poleA": "Governed AI as trusted infrastructure",
          "poleB": "Ungoverned AI as a trust-and-equity threat",
          "sharpest": true,         // exactly one per driver is the sharpest axis
          "outcomes": [
            {
              "id": "recXXX…",
              "label": "Governed public AI",
              "direction": "Positive for public health",   // or "Negative for public health" | "Mixed / depends"
              "alignment": "Engineered alignment",          // see below
              "narrative": "…",         // one-line world-state
              "strategicMove": "…",     // the strategic payload ("" if not yet written)
              "impacts": [
                {
                  "id": "recXXX…",
                  "label": "…",
                  "effect": "Strengthens",   // Strengthens | Weakens | Breaks / reverses | Reshapes | Neutral / unclear
                  "magnitude": "High",       // High | Medium | Low
                  "mechanism": "…",          // how the outcome hits this loop
                  "loopName": "R1 — Delivery-reputation engine",
                  "loopSubsystem": "Bridge & Extend",         // display name of the PHI function / seam
                  "loopCode": "R1"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Enumerations

- **direction:** `Positive for public health`, `Negative for public health`, `Mixed / depends`
- **alignment:** `Self-aligned`, `Engineered alignment`, `Needs collective action`, `Mixed / depends`
- **effect:** `Strengthens`, `Weakens`, `Breaks / reverses`, `Reshapes`, `Neutral / unclear`
- **magnitude:** `High`, `Medium`, `Low`
- **subsystems (loopSubsystem display names):** `Anchor`, `Convene`, `Amplify`, `Translate & Disperse`, `Steward`, `Bridge & Extend`, `Cross-cutting`

### Themes (sort order the explorer uses)

`Keystone`, `Trust, Legitimacy & Information`, `The Social Fabric`, `The Institutional Base`, `The Data & AI Inflection`, `The Shifting Burden of Disease`, `Decentralization & Consumerization`.

Within a theme, top-ranked drivers sort first. Within a driver, the sharpest-axis uncertainty sorts first. Within an uncertainty, outcomes sort Positive, then Mixed / depends, then Negative.

---

## Airtable source (optional, for syncing back)

This repo is an export of an Airtable base. You only need this if you want to push edits back to Airtable; the local build workflow does not require it.

- **Base (NNPHI):** `appJbrDG28mXRJgfA`

| Table | Table id | Key fields (field id) |
|---|---|---|
| Drivers | `tblZR59af1NuvIFV2` | Driver `fldE92RfsBncVyFtJ`, Theme `fldANPVUDibYd6AuS`, Headline `fldgW97gApGH8GLb3`, Short `fld0rbSfcHV7U51jB`, Long `fldoxlYGw5F1Wm7gh`, Impact `flddlO4Dkx3TEYFuY`, Uncertainty `flddXsObymkYCfnw1`, Top-Right `fldywSvYG02XgRtc5`, Neutral reading `fldYgNUevZodQzPhP`, Neutral headline `fldvPYDHUYqomKHUb`, Neutral name `fldtylcomKRIuVDSG` |
| Uncertainties | `tblKUDDCUuYexX0XV` | Uncertainty `fldpdzw8X9H5wa01K`, Question `fldY303ez75GP65Qi`, Driver (link) `flddq3DmN83tHmZDZ`, Sharpest Axis? `fldphxGBHTaRAbNiz`, Pole A `fldK5mpF6KZpb5vfL`, Pole B `fld3pBIDUhcqKYz7u` |
| Outcomes | `tblbUJE9HxNvtIqDL` | Outcome `fldcqekdCUiWunaF6`, Uncertainty (link) `fldVYdbIBQ4iDtwBL`, Direction `fldrV5o3aOqUxWwJI`, Alignment `fldkEDO1NNdDsvoen`, Narrative `fldk8qwfO5ymcPyp3`, **Strategic move** `fldkLm8TRW7GnJByU` |
| Loop Impacts | `tblqdBPTYjjEHUujK` | Impact `fldPG2EiFUMLEEMPw`, Outcome (link) `fld7Xq7PacvXd6Ej9`, Loop (link) `fldjc443fUCzSF2Xz`, Effect `fldmUv1mLHkuZtYKE`, Magnitude `fldbO5zxfa3LYpbz3`, Mechanism `fldE7fciM71u0Mzd2` |
| Loops & Key Structures | `tblpi7WizRFfjyVMu` | Name `fldID9y7rc7NfpYyp`, Subsystem `fld6cYxnfpkh8Mah8`, Type `fldXkhye7CvMwygUQ`, Code `fldECfCqfPJVyWafe` |

The Loops table also models the systems maps (nodes, edges, and loop descriptions) and links to a Nodes and an Edges table not exported here. The `docs/systems-maps/*.svg` files are the visual source for those.
