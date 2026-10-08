-- T104 · RN06 · RNF10: la auditoría solo admite inserciones. Cualquier UPDATE o DELETE falla.
CREATE FUNCTION "auditoria_inalterable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La auditoría no se puede modificar ni borrar';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "auditoria_sin_cambios"
  BEFORE UPDATE OR DELETE ON "auditoria"
  FOR EACH ROW EXECUTE FUNCTION "auditoria_inalterable"();
