/** Trámites habituales en Bolivia según el tipo de operación. La empresa los ajusta en cada expediente. */
export const LEGAL_STEPS: Record<string, string[]> = {
  SALE: ['Folio real actualizado de Derechos Reales', 'Certificado catastral', 'Impuestos municipales al día', 'Documentos de identidad de las partes', 'Minuta de transferencia', 'Firma ante notario', 'Pago del impuesto a la transferencia', 'Registro en Derechos Reales', 'Entrega de llaves'],
  RENT: ['Documentos de identidad de las partes', 'Contrato de alquiler', 'Garantía o depósito recibido', 'Inventario del inmueble', 'Firma del contrato', 'Entrega de llaves'],
  ANTICRETICO: ['Folio real actualizado de Derechos Reales', 'Documentos de identidad de las partes', 'Contrato de anticrético', 'Firma ante notario', 'Registro en Derechos Reales', 'Entrega del monto', 'Entrega de llaves'],
};
