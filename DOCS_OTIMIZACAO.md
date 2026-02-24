# Guia de Otimização Logística - PoupeRota Pro

Este documento detalha as melhorias implementadas e sugestões para evolução do sistema de geolocalização e rotas.

## 1. Melhorias Implementadas

### 1.1. Suavização de GPS (Filtro de Kalman)
Implementamos um **Filtro de Kalman** para tratar o ruído do GPS do entregador. 
- **Problema:** O GPS oscila mesmo quando o entregador está parado, causando "saltos" na rota.
- **Solução:** O filtro estima a posição real baseada na tendência e na incerteza da medição, resultando em uma movimentação fluida no mapa.

### 1.2. Agrupamento Geográfico (Clustering)
Adicionamos lógica de **Clustering** antes da otimização.
- **Problema:** Entregas no mesmo prédio ou vizinhos imediatos eram tratadas como paradas separadas, gerando ordens confusas.
- **Solução:** Pontos em um raio de 30 metros são agrupados. A rota é otimizada entre os *centróides* dos grupos, e depois expandida.

### 1.3. Otimização de Rota (2-Opt Heuristic)
Evoluímos do algoritmo *Nearest Neighbor* (Vizinho mais Próximo) para o **2-Opt**.
- **Problema:** O Vizinho mais Próximo costuma criar cruzamentos de rota ineficientes.
- **Solução:** O 2-Opt revisa a solução inicial trocando arestas para eliminar cruzamentos, reduzindo a distância total em média 10-15%.

### 1.4. Map Matching & Snapping (Alinhamento de Vias)
Implementamos uma camada de correção de coordenadas via API.
- **Problema:** O GPS pode indicar que o entregador está dentro de um prédio ou no quintal, o que confunde o cálculo de rota.
- **Solução:** Utilizamos o endpoint `/v2/snap` do OpenRouteService para projetar a coordenada original na via mais próxima que seja navegável.
- **Resultado:** Marcadores alinhados com a rua, garantindo que o início da navegação seja preciso e que o entregador saiba exatamente em qual lado da rua parar.

---

## 2. Estratégia Técnica de Snapping

### 2.1. Fluxo de Processamento
1. **Captura:** Recebe `[lat, lon]` original do GPS ou upload.
2. **Requisição:** Envia para o serviço de Snapping com um raio de busca (ex: 350m).
3. **Validação:** A API retorna a coordenada projetada na "edge" (rua) mais provável.
4. **Persistência:** O app armazena a `latitude_original` para auditoria e usa a `latitude_corrigida` para toda a lógica visual e de roteamento.

### 2.2. Redução de Erro Urbano
- **Canyons Urbanos:** Em cidades com prédios altos, o sinal de GPS reflete. O Snapping corrige isso ao "forçar" o ponto para a rua, ignorando desvios impossíveis (como estar dentro de uma parede).
- **Lado da Rua:** Ao usar Map Matching avançado, o sistema identifica o sentido da via e posiciona o marcador no local de parada ideal.

### 3.1. Map Matching (Snap to Roads)
Para garantir que os pontos estejam exatamente sobre as vias:
- **API Recomendada:** OpenRouteService `/v2/snap`.
- **Dica:** Não envie todos os pontos de uma vez se forem muitos. Agrupe ou use o endpoint de `directions` com `radiuses` para forçar o snapping durante o cálculo da geometria.

### 3.2. Matriz de Distância Real
O cálculo atual usa distância Haversine (linha reta). Para precisão máxima:
- **API:** OpenRouteService `/v2/matrix`.
- **Por que:** Considera mãos de direção, barreiras físicas (rios, ferrovias) e viadutos que a distância em linha reta ignora.

### 3.3. Arquitetura Backend (Escalabilidade)
Para suportar 200+ entregas com janelas de tempo:
- **VROOM:** Recomendamos integrar o motor **VROOM** (que o ORS usa internamente). Ele resolve problemas de VRP (Vehicle Routing Problem) com restrições de capacidade e tempo de forma extremamente performática.
- **Cache de Geocodificação:** Armazene resultados de Map Matching em um Redis para evitar chamadas repetidas para o mesmo endereço/coordenada.

### 3.4. Redução de Erros de Localização
- **Dead Reckoning:** No app mobile, use o acelerômetro e giroscópio para estimar a posição quando o sinal de GPS falha (túneis ou prédios altos).
- **Validação de Input:** Durante o upload do Excel, valide se as coordenadas caem dentro do perímetro urbano esperado.

---

## 4. Exemplo de Integração ORS Matrix (Node.js)

```javascript
async function getOptimizedMatrix(points) {
  const response = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
    method: 'POST',
    headers: { 'Authorization': 'SUA_CHAVE_API' },
    body: JSON.stringify({
      locations: points.map(p => [p.lon, p.lat]),
      metrics: ['duration', 'distance'],
      resolve_locations: true
    })
  });
  return await response.json();
}
```

## 5. Próximos Passos Sugeridos
1. **Integração de Trânsito em Tempo Real:** Usar dados históricos ou live para evitar vias congestionadas em horários de pico.
2. **Geofencing:** Notificar o cliente automaticamente quando o entregador entrar em um raio de 500m da entrega.
3. **Machine Learning para Tempo de Serviço:** Estimar quanto tempo o entregador gasta em cada tipo de parada (casa vs. prédio) para previsões de ETA mais precisas.
