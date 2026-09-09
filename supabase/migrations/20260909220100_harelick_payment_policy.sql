-- Targeted configuration only; no patient records. Do not apply during development.
-- Verified org: HARELICK DENTAL ASSOCIATES, LLC, 2026-09-09 orgs read.
UPDATE public.fof_settings SET payment_policy = $policy${
  "version": 1,
  "thresholdCents": 100000,
  "inclusive": true,
  "rounding": "nearestLast",
  "mixedThreshold": "explicitArrangement",
  "implantAdvance": true,
  "strategies": {
    "workup": {
      "below": [
        {
          "at": "workup",
          "weight": 1
        }
      ],
      "above": [
        {
          "at": "workup",
          "weight": 1
        }
      ]
    },
    "implant": {
      "below": [
        {
          "at": "booking",
          "weight": 1
        },
        {
          "at": "surgery",
          "weight": 1
        }
      ],
      "above": [
        {
          "at": "booking",
          "weight": 1
        },
        {
          "at": "surgery",
          "weight": 1
        }
      ]
    },
    "restoration": {
      "below": [
        {
          "at": "prep",
          "weight": 1
        },
        {
          "at": "delivery",
          "weight": 1
        }
      ],
      "above": [
        {
          "at": "booking",
          "weight": 1
        },
        {
          "at": "prep",
          "weight": 1
        },
        {
          "at": "delivery",
          "weight": 1
        }
      ]
    },
    "denture": {
      "below": [
        {
          "at": "impressions",
          "weight": 1
        },
        {
          "at": "delivery",
          "weight": 1
        }
      ],
      "above": [
        {
          "at": "booking",
          "weight": 1
        },
        {
          "at": "firstImpressionsOrTryin",
          "weight": 1
        },
        {
          "at": "delivery",
          "weight": 1
        }
      ]
    },
    "other": {
      "below": [
        {
          "at": "treatment",
          "weight": 1
        }
      ],
      "above": [
        {
          "at": "booking",
          "weight": 1
        },
        {
          "at": "treatment",
          "weight": 1
        }
      ]
    }
  },
  "labels": {
    "booking": "When this phase is scheduled",
    "workup": "At work-up",
    "surgery": "At implant surgery",
    "prep": "At prep / impression",
    "impressions": "At initial impressions",
    "tryin": "At try-in",
    "delivery": "At delivery",
    "treatment": "At treatment"
  }
}$policy$::jsonb
WHERE org_id = '852fc8e0-4071-499b-b655-f86d6f789cd5';

-- Payment classification never changes the insurance category or office fee.
INSERT INTO public.procedure_meta (org_id, code, payment_class)
SELECT '852fc8e0-4071-499b-b655-f86d6f789cd5'::uuid, code, classification
FROM (VALUES
 ('D0367','workup'), ('D0470','workup'), ('D6190','workup'), ('D5982','workup'),
 ('D6010','implant'), ('D6011','implant'),
 ('D6056','restoration'), ('D6057','restoration'), ('D6058','restoration'), ('D6059','restoration'), ('D6065','restoration'),
 ('D2740','restoration'), ('D2750','restoration'), ('D2751','restoration'), ('D2752','restoration'), ('D2790','restoration'),
 ('D5110','denture'), ('D5120','denture'), ('D5211','denture'), ('D5212','denture'), ('D5213','denture'), ('D5214','denture'),
 ('D7140','other'), ('D7210','other')
) AS seed(code,classification)
WHERE EXISTS (SELECT 1 FROM public.orgs WHERE id = '852fc8e0-4071-499b-b655-f86d6f789cd5')
ON CONFLICT (org_id,code) DO UPDATE SET payment_class = EXCLUDED.payment_class;
