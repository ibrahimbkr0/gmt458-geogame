const WORLD_ATLAS_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

export async function createGlobe(containerSelector, onCountryClick) {
  const container = document.querySelector(containerSelector);
  const size = Math.min(container.clientWidth || 600, container.clientHeight || 600);
  const baseScale = size * 0.45;

  // 1. Ortografik (3B küre) projeksiyonu ve yol çizici
  const projection = d3.geoOrthographic()
    .scale(baseScale)
    .translate([size / 2, size / 2])
    .clipAngle(90)
    .rotate([-20, -25, 0]); // Başlangıç açısı Avrupa/Akdeniz odaklı

  const path = d3.geoPath(projection);

  // 2. SVG tuvalini oluştur
  const svg = d3.select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${size} ${size}`);

  // Okyanus (kürenin arka planı)
  const ocean = svg.append("path")
    .datum({ type: "Sphere" })
    .attr("class", "ocean")
    .attr("d", path);

  // Enlem-boylam çizgileri (graticule)
  const graticule = svg.append("path")
    .datum(d3.geoGraticule10())
    .attr("class", "graticule")
    .attr("d", path);

  // 3. Natural Earth dünya poligon verisini çek ve GeoJSON'a dönüştür
  const worldData = await d3.json(WORLD_ATLAS_URL);
  const countries = topojson.feature(worldData, worldData.objects.countries).features;

  // 4. Ülke poligonlarını çiz
  let isDragging = false;

  const countryPaths = svg.append("g")
    .selectAll("path")
    .data(countries)
    .join("path")
    .attr("class", "country")
    .attr("data-id", (d) => String(d.id).padStart(3, "0"))
    .attr("d", path)
    .on("click", (event, d) => {
      if (isDragging) return; // Sürükleme biterken yanlışlıkla tıklama sayılmasını önler
      const normalizedId = String(d.id).padStart(3, "0");
      onCountryClick({
        id: normalizedId,
        name: d.properties.name,
        centroid: d3.geoCentroid(d) // [boylam, enlem] — mesafe ve yön hesabı için hazır
      });
    });

  function redraw() {
    ocean.attr("d", path);
    graticule.attr("d", path);
    countryPaths.attr("d", path);
  }

  // 5. Fareyle sürükleyerek 3B küreyi döndürme (Event Handler)
  let dragDistance = 0;

  const drag = d3.drag()
    .on("start", () => {
      dragDistance = 0;
      isDragging = false;
    })
    .on("drag", (event) => {
      dragDistance += Math.hypot(event.dx, event.dy);
      if (dragDistance > 4) isDragging = true;

      const rotate = projection.rotate();
      const sensitivity = 75 / projection.scale(); // Yakınlaştıkça daha hassas döner
      const nextLon = rotate[0] + event.dx * sensitivity;
      const nextLat = Math.max(-85, Math.min(85, rotate[1] - event.dy * sensitivity));

      projection.rotate([nextLon, nextLat, rotate[2]]);
      redraw();
    })
    .on("end", () => {
      setTimeout(() => { isDragging = false; }, 0);
    });

  svg.call(drag);

  // 6. Fare tekerleğiyle yakınlaştırma / uzaklaştırma (küçük ülkeler için)
  svg.on("wheel", (event) => {
    event.preventDefault();
    const zoomFactor = event.deltaY < 0 ? 1.12 : 0.89;
    const nextScale = Math.max(baseScale * 0.8, Math.min(baseScale * 4, projection.scale() * zoomFactor));
    projection.scale(nextScale);
    redraw();
  });

  // Dışarıya açılan yardımcı kontrol fonksiyonları (Adım 3 ve 4'te kullanacağız)
  return {
    highlightCountry(countryId, statusClass) {
      const normalized = String(countryId).padStart(3, "0");
      countryPaths
        .filter((d) => String(d.id).padStart(3, "0") === normalized)
        .classed("correct wrong", false)
        .classed(statusClass, true);
    },
    resetColors() {
      countryPaths.classed("correct wrong", false);
    },
    getCountryCentroid(countryId) {
      const normalized = String(countryId).padStart(3, "0");
      const feature = countries.find((d) => String(d.id).padStart(3, "0") === normalized);
      return feature ? d3.geoCentroid(feature) : null;
    }
  };
}