-- Plantilla de peso & balance del Cherokee 140 (YS-155-PE, id_aeronave 6),
-- espejo de la entrada del frontend (aircraft.js, key pa28_140). Datos
-- específicos del avión dados por Daniel (vacío 1275 @ 85.7, máx 2150/1950,
-- combustible 50/48); brazos y envolvente heredados del Cherokee PA-28
-- (decisión de Daniel: "del 155 podemos usar el mismo POH que el cherokee").
-- Idempotente (solo inserta si el avión no tiene plantilla).

DO $$
DECLARE nueva_id INTEGER;
BEGIN
  IF (SELECT id_wb_plantilla FROM aeronave WHERE id_aeronave = 6) IS NULL THEN
    INSERT INTO wb_plantilla (
      nombre, unidad_arm, empty_weight, empty_weight_arm, empty_weight_moment,
      max_takeoff_weight, max_landing_weight, fuel_capacity_gal, fuel_usable_gal,
      fuel_burn_gal_hr, fuel_lb_gal, moment_div1000, fuel_burn_note,
      estaciones, limits_normal, limits_utility
    ) VALUES (
      'PA-28-140 Cherokee', 'inches', 1275, 85.7, 109267.5,
      2150, 1950, 50, 48,
      8, 6.0, FALSE, '8 gal/hr',
      '[
        {"id":"oil","arm":27.5,"is_oil":true,"nombre":"Oil (8qt max, 7lb/gal)","is_fixed":true,"max_weight":14,"fixed_weight":14},
        {"id":"front","arm":80.5,"nombre":"Front Seat L & R","max_weight":400},
        {"id":"fuel","arm":95,"nombre":"Fuel (50 gal cap, 48 usable)","is_fuel":true,"max_gal":48,"max_weight":null},
        {"id":"rear","arm":118.1,"nombre":"Rear Seat L & R","max_weight":300},
        {"id":"bag","arm":142.8,"nombre":"Baggage (200 lb max)","max_weight":200}
      ]'::jsonb,
      '[
        {"w":1400,"fwd":81,"aft":93},
        {"w":1500,"fwd":81,"aft":93},
        {"w":2000,"fwd":82.5,"aft":93},
        {"w":2100,"fwd":84,"aft":93},
        {"w":2450,"fwd":87.72,"aft":93.5}
      ]'::jsonb,
      '[
        {"w":1400,"fwd":81,"aft":89},
        {"w":1950,"fwd":85,"aft":89}
      ]'::jsonb
    )
    RETURNING id_wb_plantilla INTO nueva_id;

    UPDATE aeronave SET id_wb_plantilla = nueva_id WHERE id_aeronave = 6;
  END IF;
END $$;
