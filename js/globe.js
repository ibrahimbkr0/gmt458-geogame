/**
 * CultureGlobe 3D — Interactive D3.js Pixel-Edge Orthographic Globe
 * Supports desktop drag/wheel + mobile touch drag, 2-finger pinch zoom, and tap guard.
 */

const WORLD_ATLAS_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

function normalizeId(id) {
  return String(id).padStart(3, "0");
}

function getTouchDistance(t1, t2) {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
}

export async function createGlobe(svgSelector, { onCountryClick }) {
  const svg = d3.select(svgSelector);
  const svgNode = svg.node();

  const worldData = await d3.json(WORLD_ATLAS_URL);
  const countriesGeo = topojson.feature(
    worldData,
    worldData.objects.countries
  ).features;

  const centroidsById = new Map();
  countriesGeo.forEach((feature) => {
    const id = normalizeId(feature.id);
    centroidsById.set(id, d3.geoCentroid(feature));
  });

  const projection = d3.geoOrthographic().clipAngle(90);
  const path = d3.geoPath(projection);
  const graticule = d3.geoGraticule10();

  let baseScale = 320;
  let currentScale = baseScale;
  let centerX = 0;
  let centerY = 0;
  let interactive = false;
  let mobilePanelCollapsed = false;
  let idleTimer = null;
  let activeFocusTransition = null;

  // Touch & drag guards
  let isPinching = false;
  let lastPinchDist = null;
  let dragStartPos = null;
  let dragMoved = false;
  let suppressNextClick = false;

  svg.selectAll("*").remove();

  // Concentric dashed pink pixel orbit ring
  const orbitRing = svg.append("circle").attr("class", "globe-orbit-ring");

  const oceanPath = svg
    .append("path")
    .datum({ type: "Sphere" })
    .attr("class", "sphere-ocean");

  const graticulePath = svg
    .append("path")
    .datum(graticule)
    .attr("class", "graticule");

  const countriesLayer = svg.append("g").attr("class", "countries-layer");

  const countryPaths = countriesLayer
    .selectAll("path")
    .data(countriesGeo)
    .join("path")
    .attr("class", "country locked")
    .attr("data-id", (d) => normalizeId(d.id))
    .on("click", (event, d) => {
      if (!interactive || suppressNextClick || isPinching) return;
      event.stopPropagation();
      const id = normalizeId(d.id);
      const name = d.properties?.name || "Unknown";
      const centroid = centroidsById.get(id) || d3.geoCentroid(d);
      onCountryClick({ id, name, centroid });
    });

  function render() {
    orbitRing
      .attr("cx", centerX)
      .attr("cy", centerY)
      .attr("r", currentScale + 14);
    oceanPath.attr("d", path);
    graticulePath.attr("d", path);
    countryPaths.attr("d", path);
  }

  function clampScale(scale) {
    return Math.max(baseScale * 0.78, Math.min(baseScale * 3.8, scale));
  }

  function computeLayout(resetScale = false) {
    const rect = svgNode.getBoundingClientRect();
    const width = Math.max(300, rect.width || window.innerWidth);
    const height = Math.max(300, rect.height || window.innerHeight);
    const isDesktop = width > 1024;

    if (isDesktop) {
      const panelWidth = Math.min(470, Math.max(410, width * 0.28));
      const panelRightEdge = 24 + panelWidth;
      const openWidth = Math.max(340, width - panelRightEdge - 24);

      centerX = panelRightEdge + openWidth * 0.5;
      centerY = height * 0.54;

      const newBaseScale = Math.min(openWidth * 0.44, height * 0.42);
      const prevRatio = baseScale > 0 ? currentScale / baseScale : 1;
      baseScale = Math.max(150, newBaseScale);
      currentScale = resetScale ? baseScale : clampScale(baseScale * prevRatio);
    } else {
      const isPhone = width <= 640;
      const topSpace = isPhone ? 110 : 138;
      const bottomSpace = mobilePanelCollapsed
        ? isPhone
          ? 128
          : 145
        : Math.min(height * 0.47, isPhone ? 360 : 390);

      const availHeight = Math.max(170, height - topSpace - bottomSpace);
      centerX = width * 0.5;
      centerY = topSpace + availHeight * 0.5;

      const newBaseScale = Math.min(width * 0.42, availHeight * 0.43);
      const prevRatio = baseScale > 0 ? currentScale / baseScale : 1;
      baseScale = Math.max(88, newBaseScale);
      currentScale = resetScale ? baseScale : clampScale(baseScale * prevRatio);
    }

    projection.translate([centerX, centerY]).scale(currentScale);
    render();
  }

  function cancelFocusTransition() {
    if (activeFocusTransition) {
      svg.interrupt("focus-globe");
      activeFocusTransition = null;
    }
  }

  // Single-finger / mouse drag rotation
  const dragBehavior = d3
    .drag()
    .filter((event) => {
      if (isPinching) return false;
      if (event.touches && event.touches.length > 1) return false;
      return !event.ctrlKey && !event.button;
    })
    .on("start", (event) => {
      cancelFocusTransition();
      dragStartPos = [event.x, event.y];
      dragMoved = false;
    })
    .on("drag", (event) => {
      if (isPinching || !dragStartPos) return;
      if (
        !dragMoved &&
        Math.hypot(event.x - dragStartPos[0], event.y - dragStartPos[1]) > 6
      ) {
        dragMoved = true;
      }
      const sensitivity = 72 / projection.scale();
      const [lon, lat, roll] = projection.rotate();
      const nextLon = lon + event.dx * sensitivity;
      const nextLat = Math.max(-82, Math.min(82, lat - event.dy * sensitivity));
      projection.rotate([nextLon, nextLat, roll || 0]);
      render();
    })
    .on("end", () => {
      if (dragMoved) {
        suppressNextClick = true;
        setTimeout(() => {
          suppressNextClick = false;
        }, 70);
      }
      dragStartPos = null;
      dragMoved = false;
    });

  svg.call(dragBehavior);

  // Desktop mouse wheel zoom
  svg.on(
    "wheel",
    (event) => {
      event.preventDefault();
      cancelFocusTransition();
      const zoomFactor = event.deltaY < 0 ? 1.12 : 0.89;
      currentScale = clampScale(currentScale * zoomFactor);
      projection.scale(currentScale);
      render();
    },
    { passive: false }
  );

  // Mobile 2-finger pinch-to-zoom
  svgNode.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length === 2) {
        isPinching = true;
        cancelFocusTransition();
        lastPinchDist = getTouchDistance(event.touches[0], event.touches[1]);
      }
    },
    { passive: true }
  );

  svgNode.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length === 2 && lastPinchDist) {
        event.preventDefault();
        const dist = getTouchDistance(event.touches[0], event.touches[1]);
        const ratio = dist / lastPinchDist;
        lastPinchDist = dist;
        currentScale = clampScale(currentScale * ratio);
        projection.scale(currentScale);
        render();
      }
    },
    { passive: false }
  );

  svgNode.addEventListener(
    "touchend",
    (event) => {
      if (event.touches.length < 2) {
        lastPinchDist = null;
        if (isPinching) {
          suppressNextClick = true;
          setTimeout(() => {
            isPinching = false;
            suppressNextClick = false;
          }, 90);
        }
      }
    },
    { passive: true }
  );

  projection.rotate([-18, -22, 0]);
  computeLayout(true);

  window.addEventListener("resize", () => computeLayout(false));
  window.addEventListener("orientationchange", () => {
    setTimeout(() => computeLayout(false), 150);
  });

  return {
    getCentroid(id) {
      return centroidsById.get(normalizeId(id)) || null;
    },

    markCountry(id, status) {
      const norm = normalizeId(id);
      countryPaths
        .filter((d) => normalizeId(d.id) === norm)
        .classed("wrong", status === "wrong")
        .classed("correct", status === "correct");
    },

    clearHighlights() {
      countryPaths.classed("wrong", false).classed("correct", false);
    },

    setInteractive(enabled) {
      interactive = Boolean(enabled);
      countryPaths.classed("locked", !interactive);
    },

    setMobilePanelCollapsed(collapsed) {
      mobilePanelCollapsed = Boolean(collapsed);
      computeLayout(false);
    },

    focusCountry(id) {
      const centroid = centroidsById.get(normalizeId(id));
      if (!centroid) return;

      cancelFocusTransition();
      const startRotate = projection.rotate();
      const targetRotate = [
        -centroid[0],
        Math.max(-75, Math.min(75, -centroid[1])),
        0
      ];
      const interpolator = d3.interpolate(startRotate, targetRotate);

      activeFocusTransition = svg
        .transition("focus-globe")
        .duration(650)
        .ease(d3.easeCubicOut)
        .tween("rotate", () => (t) => {
          projection.rotate(interpolator(t));
          render();
        })
        .on("end interrupt", () => {
          activeFocusTransition = null;
        });
    },

    zoomIn() {
      cancelFocusTransition();
      currentScale = clampScale(currentScale * 1.25);
      projection.scale(currentScale);
      render();
    },

    zoomOut() {
      cancelFocusTransition();
      currentScale = clampScale(currentScale * 0.8);
      projection.scale(currentScale);
      render();
    },

    resetView() {
      cancelFocusTransition();
      currentScale = baseScale;
      projection.scale(currentScale).rotate([-18, -22, 0]);
      render();
    },

    startIdleSpin() {
      if (idleTimer) return;
      idleTimer = d3.timer(() => {
        const [lon, lat, roll] = projection.rotate();
        projection.rotate([lon + 0.14, lat, roll || 0]);
        render();
      });
    },

    stopIdleSpin() {
      if (idleTimer) {
        idleTimer.stop();
        idleTimer = null;
      }
    }
  };
}