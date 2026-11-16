package br.univates.medicalfield.clinical.sync;

import br.univates.medicalfield.clinical.data.EntityDef;
import br.univates.medicalfield.clinical.data.EntityDef.Campo;

import java.util.*;

/**
 * Mesclagem campo a campo (merge) - padrão para o PRONTUÁRIO:
 *  - campo vazio de um lado: usa o valor preenchido do outro;
 *  - campos cumulativos (alergias, comorbidades...): UNIÃO dos itens,
 *    pois perder uma alergia registrada é um risco clínico;
 *  - demais campos divergentes: vence o lado com atualizadoEm mais recente;
 *  - medicamentos administrados: união por id.
 */
public final class FieldMergeStrategy implements ConflictStrategy {
    @Override public String nome() { return "MERGE"; }

    @Override
    @SuppressWarnings("unchecked")
    public Map<String, Object> resolver(EntityDef def, Map<String, Object> servidor, Map<String, Object> cliente) {
        boolean clienteRecente = ConflictStrategy.clienteMaisRecente(servidor, cliente);
        Map<String, Object> r = new LinkedHashMap<>();
        for (Campo campo : def.campos()) {
            String k = campo.json();
            Object vs = servidor.get(k), vc = cliente.get(k);
            Object v;
            if (k.equals("id") || Objects.equals(vs, vc) || vc == null) v = vs;
            else if (vs == null) v = vc;
            else if (def.camposCumulativos().contains(k)) v = unir(vs.toString(), vc.toString());
            else v = clienteRecente ? vc : vs;
            r.put(k, v);
        }
        if (def.temMedicamentos()) {
            Map<Object, Map<String, Object>> porId = new LinkedHashMap<>();
            List<Map<String, Object>> antigos = (List<Map<String, Object>>) (clienteRecente ? servidor : cliente).get("medicamentos");
            List<Map<String, Object>> novos = (List<Map<String, Object>>) (clienteRecente ? cliente : servidor).get("medicamentos");
            if (antigos != null) antigos.forEach(m -> porId.put(m.get("id"), m));
            if (novos != null) novos.forEach(m -> porId.put(m.get("id"), m));
            r.put("medicamentos", new ArrayList<>(porId.values()));
        }
        r.put("atualizadoEm", clienteRecente ? cliente.get("atualizadoEm") : servidor.get("atualizadoEm"));
        return r;
    }

    /** "Penicilina, Dipirona" + "dipirona; Látex" -> "Penicilina, Dipirona, Látex" */
    static String unir(String a, String b) {
        LinkedHashMap<String, String> itens = new LinkedHashMap<>();
        for (String parte : (a + "," + b).split("[,;\\n]")) {
            String t = parte.trim();
            if (!t.isEmpty()) itens.putIfAbsent(t.toLowerCase(Locale.ROOT), t);
        }
        return String.join(", ", itens.values());
    }
}
