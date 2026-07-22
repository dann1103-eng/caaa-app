-- Plantilla de peso & balance del Cessna 310Q (YS-259-PE, id_aeronave 7) en la
-- BD, espejo de la entrada del frontend (CAA-frontend/src/loadsheet/data/aircraft.js,
-- key c310). El loadsheet funciona desde el archivo del frontend; esto mantiene
-- la BD consistente (§9) para que aeronave.id_wb_plantilla no quede NULL y la
-- ficha del avión muestre "tiene plantilla". Datos del POH (foto) + confirmados
-- por Daniel (envolvente). Idempotente (solo inserta si el avión no tiene una).

DO $$
DECLARE nueva_id INTEGER;
BEGIN
  IF (SELECT id_wb_plantilla FROM aeronave WHERE id_aeronave = 7) IS NULL THEN
    INSERT INTO wb_plantilla (
      nombre, unidad_arm, empty_weight, empty_weight_arm, empty_weight_moment,
      max_takeoff_weight, max_landing_weight, fuel_capacity_gal, fuel_usable_gal,
      fuel_burn_gal_hr, fuel_lb_gal, moment_div1000, fuel_burn_note,
      estaciones, limits_normal
    ) VALUES (
      'Cessna 310Q', 'inches', 3214, 36.0, 115704,
      5300, 5300, 143, 143,
      30, 6.0, FALSE, 'Bimotor — aprox. 30 gal/hr total',
      '[
        {"id":"pilot","arm":37,"nombre":"Pilot","max_weight":300},
        {"id":"copilot","arm":37,"nombre":"Co-pilot","max_weight":300},
        {"id":"center_l","arm":71,"nombre":"Center Seat L","max_weight":300},
        {"id":"center_r","arm":71,"nombre":"Center Seat R","max_weight":300},
        {"id":"rear_l","arm":98,"nombre":"Rear Seat L","max_weight":300},
        {"id":"rear_r","arm":98,"nombre":"Rear Seat R","max_weight":300},
        {"id":"wing_lockers","arm":63,"nombre":"Wing Lockers","max_weight":null},
        {"id":"rear_baggage","arm":124,"nombre":"Rear Baggage","max_weight":null},
        {"id":"baggage","arm":96,"nombre":"Baggage","max_weight":null},
        {"id":"main_fuel","arm":35,"nombre":"Main Tanks (102 gal, 51/lado)","is_fuel":true,"max_gal":102,"max_weight":null},
        {"id":"aux_fuel","arm":47,"nombre":"Aux Tanks (41 gal, 20.5/lado)","is_fuel":true,"max_gal":41,"max_weight":null}
      ]'::jsonb,
      '[
        {"w":3100,"fwd":32.0,"aft":43.5},
        {"w":4500,"fwd":32.0,"aft":43.5},
        {"w":4900,"fwd":34.5,"aft":43.5},
        {"w":5300,"fwd":37.0,"aft":43.0}
      ]'::jsonb
    )
    RETURNING id_wb_plantilla INTO nueva_id;

    UPDATE aeronave SET id_wb_plantilla = nueva_id WHERE id_aeronave = 7;
  END IF;
END $$;
