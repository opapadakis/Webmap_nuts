let nutsData = null;

const CONFIG = {
    mode: "local", // "local" OR "github"

    local: {
        base: "/data/webmap"
    },

    github: {
        base: "https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/data/webmap"
    }
};

const map = new maplibregl.Map({
    container: "map",
    style: `https://api.maptiler.com/maps/outdoor/style.json?key=${MAPTILER_KEY}`,
    center: [-3.7, 40.4], // Spain
    zoom: 5
});

map.on("load", async () => {

    await loadNuts();

    map.addSource("nuts", {
        type: "geojson",
        data: nutsData
    });

    map.addLayer({
        id: "regions",
        type: "fill",
        source: "nuts",
        paint: {
            "fill-color": "#ccc",
            "fill-opacity": 0.5
        }
    });

    loadCatalog();
});

function getDataPath(path) {
    return `${CONFIG[CONFIG.mode].base}/${path}`;
}

async function loadNuts() {
    try {
        const res = await fetch("data/nutsrg_2.json");
        //console.log("NUTS response:", res);
        nutsData = await res.json();
        //console.log("Loaded NUTS data:", nutsData);
    } catch (e) {
        console.error("Failed to load from /data/webmap, trying fallback...");
        // Fallback to the original URL if the local file fails
        //geojson: 
        url="https://raw.githubusercontent.com/eurostat/Nuts2json/master/pub/v2/2021/4326/20M/nutsrg_2.json"
        const res = await fetch(url);
        nutsData = await res.json();
        console.log("Loaded from fallback URL:", url);
    }
}

async function loadCatalog() {
    const res = await fetch("data/layers_catalog.csv");
    const text = await res.text();

    const rows = text.split("\n").slice(1);

    const menu = document.getElementById("menu");
    menu.innerHTML = "";

    const categories = {};

    rows.forEach(r => {
        if (!r.trim()) return;

        const cols = r.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
        
        const category = cols[0];
        const layer = cols[1];
        const definition = cols[2];
        const api = cols[5];
        const unit =cols[9]
        const style = cols[11].trim()
                .replace(/^"/, '')     // remove first quote
                .replace(/"$/, '')     // remove last quote
                .replace(/""/g, '"');  // fix double quotes
        console.log("Parsed row:", { category, layer, definition, style,api });
        // group by category
        if (!categories[category]) {
            categories[category] = [];
        }

        categories[category].push({
            layer,
            definition,
            api,
            style,
            unit
        });
    });

    // build menu
    Object.keys(categories).forEach(cat => {

        // category title
        const title = document.createElement("div");
        title.textContent = "+ " + capitalizeFirstLetter(cat);
        title.classList.add("category-title");

        const container = Object.assign(document.createElement("div"), {
            className: "legend-container hidden"
        });

        title.onclick = () => {
            container.classList.toggle("hidden");

            const isHidden = container.classList.contains("hidden");
            title.textContent = (isHidden ? "+ " : "− ") + capitalizeFirstLetter(cat);
        };

        menu.appendChild(title);
        menu.appendChild(container);
        
        // layers
        categories[cat].forEach(item => {
            console.log("Layer item:", item);
            console.log("Parsed style:", item.style);
            const btn = document.createElement("button");

            // use definition instead of layer
            btn.textContent = capitalizeFirstLetter(item.definition);
            
            const legend = document.createElement("div");
            legend.style.display = "none";
            const styleArray = typeof item.style === "string"
                ? JSON.parse(
                    item.style
                        .trim()
                        .replace(/^"/, '')
                        .replace(/"$/, '')
                        .replace(/""/g, '"')
                )
                : item.style;
            //console.log("Parsed style array:", styleArray);
            const header = document.createElement("div");

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = true;

            const label = document.createElement("span");
            label.textContent = capitalizeFirstLetter(item.definition) + (item.unit ? ` (${item.unit})` : "");
            
            label.style.marginLeft = "6px";

            header.appendChild(checkbox);
            header.appendChild(label);

            legend.appendChild(header);
            styleArray.forEach(s => {
                const key = Object.keys(s)[0];
                const value = s[key];

                const row = document.createElement("div");

                const colorBox = document.createElement("span");
                colorBox.style.background = value;
                colorBox.classList.add("legend-color");

                const text = document.createElement("span");
                text.textContent = key;

                row.appendChild(colorBox);
                row.appendChild(text);

                legend.appendChild(row);
            });
            btn.onclick = () => {
                loadEurostatLayer(item.layer, item.api, item.style,item.unit);
                btn.style.display = "none";
                legend.style.display = "block";
                checkbox.checked = true;
                
                // Ensure layer visibility matches checkbox state
                if (map.getLayer(item.layer)) {
                    map.setLayoutProperty(item.layer, "visibility", "visible");
                }
            };

            checkbox.onchange = () => {
            if (map.getLayer(item.layer)) {
                
                map.setLayoutProperty(
                    item.layer,
                    "visibility",
                    checkbox.checked ? "visible" : "none"
                );
            }
        };
            //btn.insertAdjacentHTML("afterend", "<br>");
            container.appendChild(btn);
            container.appendChild(legend);
            

        });
    });
}


function capitalizeFirstLetter(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function loadEurostatLayer(layerName, apiUrl, style,unit) {

    
    //apiUrl = apiUrl+'?geoLevel=nuts2&time=2024'
    console.log("Fetching:", layerName, "API URL:", apiUrl);
    const res = await fetch(apiUrl);
    const data = await res.json();

    const values = extractEurostatValues(data);

    applyDataToMap(layerName, values, style,unit);
}

function extractEurostatValues(data) {

    const result = {};
    console.log("Extracting values from data:", data);
    const geoIndex = data.dimension.geo.category.index;
    const values = data.value;

    Object.keys(geoIndex).forEach(region => {

        const index = geoIndex[region];
        const value = values[index];

        if (value !== undefined) {
            result[region] = value;
        }
    });

    return result;
}


function createOrUpdateLayer(layerName, styleStr, valueProp,unit) {
  const style = JSON.parse(styleStr);
  const stops = style.map(s => {
    const key = Object.keys(s)[0];
    const color = s[key];
    const idx = key.lastIndexOf("-");
    const min = parseFloat(key.slice(0, idx));
    return [min, color];
  }).flat();

  const paint = {
    "fill-color": [
      "interpolate",
      ["linear"],
      ["get", valueProp],
      ...stops
    ],
    "fill-opacity": 0.4
  };

  if (!map.getLayer(layerName)) {
    map.addLayer({
      id: layerName,
      type: "fill",
      source: "nuts",
      paint,
      layout: { visibility: "visible" }
    });
    let hoverPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 10,
        className: "hover-popup"
    });

    map.on("mousemove", layerName, (e) => {
    map.getCanvas().style.cursor = e.features.length ? "pointer" : "";

    const features = e.features || [];
    if (!features.length) {
        hoverPopup.remove();
        return;
    }

    const f = features[0]; // keep it simple (first feature only)
    const props = f.properties || {};

    const html = Object.entries(props)
    .map(([k, v]) => {
        const key = k === "na" || k === "id"
            ? (k === "na" ? "Name" : "Id")
            : k.replace(/^value_/, '').replace(/_/g, ' ')
               .replace(/\b\w/g, c => c.toUpperCase());

        const value = v;

        return `${key}: <b>${value}</b>`;
    })
    .join("<br>");


    hoverPopup
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);
    });

    map.on("mouseleave", layerName, () => {
    map.getCanvas().style.cursor = "";
    hoverPopup.remove();
    });

  } else {
    map.setPaintProperty(layerName, "fill-color", [
      "interpolate",
      ["linear"],
      ["get", valueProp],
      ...stops
    ]);
  }
}

function applyDataToMap(layerName, values, style,unit) {
  const valueProp = `value_${layerName}`;

  nutsData.features.forEach(f => {
    const code = f.properties.id;
    f.properties[valueProp] = values[code] ?? null;
  });

  map.getSource("nuts").setData(nutsData);

  createOrUpdateLayer(layerName, style, valueProp, unit);
}

function applyStyle(styleStr) {
    console.log("Applying style:", styleStr);
    const style = JSON.parse(styleStr);

    const stops = [];

    style.forEach(s => {
        const key = Object.keys(s)[0];
        const color = s[key];

        const range = key.split("-");
        const min = parseFloat(range[0]);

        stops.push([min, color]);
    });

    map.setPaintProperty("regions", "fill-color", [
        "interpolate",
        ["linear"],
        ["get", "value"],
        ...stops.flat()
    ]);
}

