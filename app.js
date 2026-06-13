// ─── PROFILE ──────────────────────────────────────────────────────────────────

function buildProfile(p) {
  if (!p || !p.weight || !p.height) return {
    profile: "Sin perfil.",
    target: 1500,
    tdee: 2000
  };
  const imc = (p.weight / Math.pow(p.height / 100, 2)).toFixed(1);
  const bmr = p.sex === "M" ? 10 * p.weight + 6.25 * p.height - 5 * p.age + 5 : 10 * p.weight + 6.25 * p.height - 5 * p.age - 161;
  const mult = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725
  }[p.activity || "light"];
  const tdee = Math.round(bmr * mult);
  const def = Math.min(700, Math.max(300, tdee - 1400));
  const target = Math.max(1200, tdee - def);
  return {
    profile: `Perfil:
- ${p.sex === "M" ? "Hombre" : "Mujer"}, ${p.age} anos, ${p.weight}kg, ${p.height}cm. IMC ${imc}.
- Meta: ${p.goalWeight}kg.
- TDEE: ~${tdee}kcal/dia. Objetivo: ~${target}kcal/dia.
- Actividad: ${p.activity || "ligero"}.
${p.restrictions ? "- Restricciones: " + p.restrictions : ""}
${p.medications ? "- Medicamentos: " + p.medications : ""}
${p.notes ? "- Notas: " + p.notes : ""}`,
    target,
    tdee
  };
}
function getMacroTargets(targetKcal, weight) {
  return {
    protein: Math.round(weight * 1.6),
    carbs: Math.round(targetKcal * 0.40 / 4),
    fat: Math.round(targetKcal * 0.30 / 9),
    sugar: Math.round(targetKcal * 0.10 / 4),
    fiber: 30
  };
}
const FOOD_LOG_PROMPT = `Eres nutriologo. Analiza la comida y devuelve SOLO JSON valido (nada mas):
{
  "items": [{"name":"nombre","portion":"porcion","kcal":XXX,"protein":XX,"carbs":XX,"fat":XX,"sugar":XX,"fiber":XX,"sodium":XX}],
  "totals": {"kcal":XXX,"protein":XX,"carbs":XX,"fat":XX,"sugar":XX,"fiber":XX,"sodium":XX},
  "summary": "frase corta"
}
Estima en gramos. sodium en mg. NO uses bloques de codigo.`;
const MEAL_PROMPT = prof => prof + `
MODO PLAN:
DESAYUNO: [platillo] (~XXXkcal)
ALMUERZO: [platillo] (~XXXkcal)
CENA: [platillo] (~XXXkcal)
SNACK: [opcion] (~XXXkcal)
TOTAL: ~XXXXkcal
Si excede: ALERTA: Sobre limite. Reduce X.

MODO RESTAURANTE: Si hay carta:
PIDE: [platillo] (~XXXkcal) - razon
CON CUIDADO: [platillo] - como modificar
EVITA: [platillo] - razon
Luego plan completo.
Respeta restricciones. Directo.`;
const EXERCISE_PROMPT = prof => prof + `
MODO EJERCICIO:
Adapta a peso, edad, comida.
Si peso>90kg: bajo impacto.

OBJETIVO: [meta]
TIEMPO: XX min | NIVEL: X
CALENTAMIENTO (5min):
- [ejercicio]
CIRCUITO:
- [ejercicio] x [series]x[reps] (~XXkcal)
ENFRIAMIENTO (5min):
- [ejercicio]
CALORIAS QUEMADAS: ~XXXkcal
BALANCE: Comiste ~XXXX - quemas ~XXX = deficit ~XXX
TIP: [consejo]`;
const CHAT_PROMPT = prof => prof + `
Eres coach experto: nutriologo + entrenador. Max 3 parrafos. Si pregunta medico delicado, recomienda consultar medico. Conoces el historial del usuario, usa esa informacion para dar respuestas personalizadas y hacer seguimiento.

CAPACIDADES IMPORTANTES:
- Tienes web_search para acceder a CUALQUIER URL, noticia, tweet, página, artículo
- Puedes leer PDFs, imágenes, archivos de texto que el usuario adjunte
- Si el usuario te pasa una URL en su mensaje, USA web_search inmediatamente para leerla
- Si el usuario te pega texto largo de un menú, artículo, tweet, etc - analízalo
- NUNCA digas frases como "no puedo abrir", "no tengo acceso", "no puedo leer", "no soy capaz de"
- Si algo es realmente imposible (ej. video), responde lo más útil posible con la info disponible y propón alternativas
- Tu actitud: "déjame ver qué puedo hacer" en lugar de "no puedo"`;
const ENTRY_ANALYSIS_PROMPT = prof => prof + `

Analiza esta comida específica que el usuario registró. Sé directo, honesto y útil. Sin rodeos.

Devuelve SOLO un JSON válido (sin markdown) con esta estructura exacta:
{
  "verdict_type": "good" | "ok" | "bad",
  "verdict": "Frase corta y directa: ¿es buena elección, regular o te pasaste? Sin azucarar nada.",
  "day_impact": "Cómo afecta esta comida tu meta del día. Ejemplo: 'Esta comida sola ya consumió 45% de tus calorías y 70% de tus grasas del día.' Si te pasaste, di EN QUÉ te pasaste y POR CUÁNTO.",
  "culprit": "Si la comida es problemática, qué item específico es el culpable. Ejemplo: 'La tortilla de harina (180kcal) y el aguacate (240kcal) representan 60% de las calorías'. Si la comida es buena, omite este campo.",
  "alternatives": ["2-3 alternativas concretas que pudiste haber comido por la misma cantidad o menos de calorías. Sin moralizar."],
  "next_time": "Recomendación práctica para próxima vez. Concreta, sin clichés. Ejemplo: 'Para tu meta de bajar peso, esta comida hubiera funcionado mejor sin la tortilla extra. Te ahorrabas 180kcal sin perder sabor.'"
}`;
const DAILY_MENU_PROMPT = (prof, target, macroT) => prof + `

Genera un MENÚ COMPLETO del día (desayuno + comida + cena + 2 snacks) BALANCEADO para CERRAR los círculos diarios.

DISTRIBUCIÓN OBLIGATORIA DE CALORÍAS para llegar exacto a ${target}kcal:
- Desayuno: ${Math.round(target * 0.25)}kcal (25% del día)
- Snack mañana: ${Math.round(target * 0.10)}kcal (10%)
- Comida: ${Math.round(target * 0.35)}kcal (35%)
- Snack tarde: ${Math.round(target * 0.10)}kcal (10%)
- Cena: ${Math.round(target * 0.20)}kcal (20%)

OBJETIVOS DE MACROS (deben cumplirse al sumar todo):
- Proteína: ${macroT.protein}g
- Carbos: ${macroT.carbs}g
- Grasas: ${macroT.fat}g
- Fibra mínimo: ${macroT.fiber}g
- Azúcar máximo: ${macroT.sugar}g

REGLAS ESTRICTAS:
1. SIN VERDURAS VISIBLES — verduras LICUADAS, RALLADAS u OCULTAS. Sin ensaladas, sin verduras al vapor.
2. SIN SALMÓN.
3. Comidas reales, sabrosas, mexicanas/familiares.
4. Sin Thermomix (cocinera prepara con utensilios normales).
5. Cada comida con LISTA DE INGREDIENTES con cantidades exactas en gramos/unidades.
6. La SUMA de las calorías de todas las comidas debe ser ${target} ± 50kcal.

Devuelve SOLO un JSON válido (sin markdown) con esta estructura:
{
  "summary": "Frase corta describiendo el día",
  "meals": [
    {
      "type": "Desayuno",
      "emoji": "☀️",
      "name": "Nombre del platillo",
      "description": "1 oración describiendo qué es",
      "kcal": ${Math.round(target * 0.25)},
      "protein": 30,
      "carbs": 35,
      "fat": 10,
      "ingredients": ["3 huevos", "1 tortilla integral", "30g queso oaxaca", "1/2 aguacate", "1 cdita aceite oliva"],
      "highlight": "Por qué es estratégico"
    }
  ],
  "totals": {"kcal": 0, "protein": 0, "carbs": 0, "fat": 0},
  "shoppingList": ["Lista consolidada de TODOS los ingredientes del día con cantidades sumadas"],
  "tips": ["3 tips concretos del día"]
}`;
const WEEKLY_REPORT_PROMPT = prof => prof + `

Genera un REPORTE SEMANAL completo de salud para el usuario basado en sus datos de los últimos 7 días.
Estructura el reporte con estos apartados (usa emojis y formato claro, máximo 350 palabras):

📊 RESUMEN
- Calorías promedio del día y comparación con su objetivo
- Tendencia general (vas bien, te pasaste, te quedaste corto)

⚖️ PROGRESO DE PESO
- Cambio en kg de la semana
- Si va por buen camino o necesita ajustes

🎯 MACROS - lo que más se debe cuidar
- Identificar qué macro se está descuidando (proteína baja? azúcar alta? etc)
- Recomendación específica

📅 PATRONES IDENTIFICADOS
- Días donde come más / menos
- Tipo de comida que tiende a ser problemática

💡 PLAN PARA LA PRÓXIMA SEMANA
- 3 acciones concretas y simples para mejorar

Tono: directo, motivacional pero realista, sin paternalismo. Usa "tú" para hablar al usuario.`;
const MEMORY_SUMMARY_PROMPT = `Lee esta conversacion entre un coach nutricional/fitness y un usuario. Genera un resumen MUY breve (max 4 lineas) con SOLO datos importantes que el coach deberia recordar para futuras conversaciones:
- Sintomas o problemas mencionados (hambre nocturna, ansiedad, fatiga, etc)
- Metas o compromisos especificos del usuario
- Reacciones a alimentos o medicamentos
- Preferencias nuevas reveladas
- Avances o retrocesos reportados

NO incluyas: saludos, preguntas generales, o info ya en el perfil base.
Formato: lista corta con viñetas. Si no hay nada relevante, responde solo "NADA".`;
const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MEAL_ICONS = {
  desayuno: "☀",
  almuerzo: "◐",
  cena: "☾",
  snack: "◇"
};
const RECIPES = [{
  "id": "d01",
  "name": "Pancakes proteicos con plátano",
  "emoji": "🥞",
  "category": "desayuno",
  "time": "15 min",
  "kcal": 380,
  "protein": 32,
  "carbs": 42,
  "fat": 10,
  "difficulty": "Fácil",
  "hidden": [],
  "benefits": ["Alta proteína", "Sin azúcar", "Saciante"],
  "description": "Hot cakes esponjosos sabor plátano y avena. Mucha proteína, cero azúcar añadida.",
  "ingredients": ["1 plátano maduro", "2 huevos", "1/2 taza avena en hojuelas", "1 scoop proteína whey vainilla", "1/2 cdita polvo para hornear", "1 cdita canela", "1/4 cdita esencia de vainilla", "Spray para sartén", "Para servir: berries, mantequilla de almendra"],
  "steps": ["Licúa todo: plátano, huevos, avena, proteína, polvo para hornear, canela, vainilla. 1 min hasta que quede mezcla suave", "Reposa 5 min para que se hidrate la avena", "Calienta sartén antiadherente a fuego medio-bajo", "Vierte porciones de 1/4 taza por pancake. Cuece 2 min hasta que salgan burbujas", "Voltea con cuidado, cuece 1.5 min del otro lado", "Sirve con berries y mantequilla de almendra"],
  "trick": "El plátano da dulzor natural, no necesitas azúcar. La proteína whey los hace esponjosos."
}, {
  "id": "d02",
  "name": "Huevos rancheros con frijoles",
  "emoji": "🍳",
  "category": "desayuno",
  "time": "15 min",
  "kcal": 420,
  "protein": 28,
  "carbs": 38,
  "fat": 18,
  "difficulty": "Fácil",
  "hidden": ["jitomate", "cebolla", "chile"],
  "benefits": ["Proteína completa", "Sabor mexicano", "Energía"],
  "description": "Clásico mexicano con salsa fresca y frijoles refritos. Te arranca el día con energía.",
  "ingredients": ["3 huevos", "2 tortillas de maíz", "1/2 taza frijoles refritos", "2 jitomates", "1/4 cebolla", "1 chile serrano", "1 ajo", "Cilantro", "Sal, aceite", "Queso fresco para espolvorear"],
  "steps": ["Licúa jitomates, cebolla, chile, ajo y sal hasta salsa", "Calienta la salsa en sartén 5 min hasta espesar", "Calienta los frijoles refritos", "Tuesta las tortillas en comal", "Fríe los huevos estrellados", "Monta: tortilla, frijoles, huevo encima, baña con salsa, espolvorea queso fresco y cilantro"],
  "trick": "La salsa licuada lleva chile y cebolla pero no las ves. Sabor intenso, sin texturas."
}, {
  "id": "d03",
  "name": "Smoothie bowl tropical proteico",
  "emoji": "🥣",
  "category": "desayuno",
  "time": "5 min",
  "kcal": 350,
  "protein": 28,
  "carbs": 45,
  "fat": 8,
  "difficulty": "Fácil",
  "hidden": ["espinaca"],
  "benefits": ["Antioxidantes", "Refrescante", "Saciante"],
  "description": "Bowl espeso con sabor a piña y mango. La espinaca desaparece entre las frutas.",
  "ingredients": ["1/2 plátano congelado", "1/2 taza piña congelada", "1/2 mango", "1 puño espinaca baby", "1 scoop proteína vainilla", "1/4 taza yogurt griego", "100ml leche de almendra", "TOPPINGS: granola, coco rallado, semillas de chía, fresas"],
  "steps": ["Pon todos los ingredientes (excepto toppings) en la licuadora", "Licúa 1 min hasta que quede súper espeso (más espeso que un smoothie normal)", "Si está muy líquido, agrega más fruta congelada", "Sirve en bowl", "Decora con granola, coco, chía y fresas"],
  "trick": "La piña enmascara cualquier sabor a verde. El plátano y mango congelados dan textura cremosa."
}, {
  "id": "d04",
  "name": "Chilaquiles verdes con pollo",
  "emoji": "🌽",
  "category": "desayuno",
  "time": "20 min",
  "kcal": 480,
  "protein": 35,
  "carbs": 42,
  "fat": 18,
  "difficulty": "Media",
  "hidden": ["tomatillo", "cilantro", "cebolla", "chile"],
  "benefits": ["Alta proteína", "Sabor mexicano", "Carga energética"],
  "description": "Chilaquiles verdes con pollo deshebrado. Salsa licuada perfecta, nada texturoso.",
  "ingredients": ["6 tortillas de maíz cortadas en triángulos", "1 pechuga de pollo cocida y deshebrada", "8 tomates verdes", "1/4 cebolla", "1 chile serrano", "1 ajo", "Puño de cilantro", "Caldo de pollo", "Aceite", "Crema, queso fresco, cebolla rebanada"],
  "steps": ["Hornea o fríe las tortillas hasta dorar", "Hierve los tomates verdes con chile, cebolla y ajo 8 min", "Licúa con cilantro y un poco de caldo hasta salsa lisa", "Calienta la salsa con sal", "Agrega los totopos y revuelve para que se bañen pero queden crujientes", "Sirve con pollo deshebrado, crema, queso y cebolla rebanada"],
  "trick": "Cilantro va licuado dentro. El chile aporta sabor sin picor texturoso."
}, {
  "id": "d05",
  "name": "Avena cremosa con manzana y canela",
  "emoji": "🌾",
  "category": "desayuno",
  "time": "10 min",
  "kcal": 340,
  "protein": 22,
  "carbs": 52,
  "fat": 7,
  "difficulty": "Fácil",
  "hidden": [],
  "benefits": ["Fibra alta", "Saciante por horas", "Bajo en grasa"],
  "description": "Avena estilo postre con manzana caliente y canela. Sabe a pay de manzana saludable.",
  "ingredients": ["1/2 taza avena en hojuelas", "1 taza leche de almendra", "1 manzana picada", "1 cdita canela", "1 scoop proteína vainilla", "1 cda nueces picadas", "1 cdita miel de agave", "Pizca de sal"],
  "steps": ["Cocina avena con leche de almendra, canela y sal a fuego medio 5 min", "En sartén aparte saltea la manzana picada con un toque de canela 3 min", "Cuando avena esté cremosa, retira del fuego", "Mezcla la proteína cuando ya no esté hirviendo (para que no se cuaje)", "Sirve con manzana encima, nueces y miel de agave"],
  "trick": "Cocer la manzana sola con canela la vuelve postre. La proteína se agrega al final para no ruinarla."
}, {
  "id": "d06",
  "name": "Burrito de huevo y queso",
  "emoji": "🌯",
  "category": "desayuno",
  "time": "15 min",
  "kcal": 420,
  "protein": 32,
  "carbs": 38,
  "fat": 16,
  "difficulty": "Fácil",
  "hidden": ["jitomate", "pimiento", "cebolla"],
  "benefits": ["Portátil", "Alta proteína", "Saciante"],
  "description": "Burrito con huevos revueltos cremosos y queso. Las verduras van picadas finísimas.",
  "ingredients": ["3 huevos", "1 tortilla harina integral grande", "1/4 taza queso oaxaca", "1/4 jitomate sin semillas picado finísimo", "1/4 pimiento rojo picado finísimo", "1 cda cebolla picada finísima", "Sal, pimienta", "Salsa al gusto"],
  "steps": ["Pica el jitomate, pimiento y cebolla súper finos (casi puré)", "Bate los huevos con sal y pimienta", "Sofríe las verduras en sartén 2 min hasta suavizarse", "Agrega los huevos batidos y revuelve a fuego medio-bajo", "Cuando estén casi listos, agrega el queso para que se derrita", "Calienta la tortilla, rellena, enrolla bien apretado", "Sirve con salsa"],
  "trick": "Picar las verduras súper finas hace que se integren al huevo sin sentir textura. Las endulza naturalmente."
}, {
  "id": "d07",
  "name": "Yogurt parfait con granola y frutos rojos",
  "emoji": "🥛",
  "category": "desayuno",
  "time": "5 min",
  "kcal": 320,
  "protein": 28,
  "carbs": 38,
  "fat": 8,
  "difficulty": "Fácil",
  "hidden": [],
  "benefits": ["Probióticos", "Antioxidantes", "Rápido"],
  "description": "Capas de yogurt griego, granola crujiente y frutos rojos. Estilo café gourmet.",
  "ingredients": ["200g yogurt griego natural", "1/4 taza granola sin azúcar", "1 taza frutos rojos (fresa, blueberry, frambuesa)", "1 cda miel de agave", "1 cda chía", "1 cda almendras laminadas"],
  "steps": ["Mezcla el yogurt con la chía y deja reposar 3 min", "En vaso o bowl: capa de yogurt, capa de granola, capa de frutos", "Repite 2 veces", "Termina con almendras laminadas y un hilo de miel de agave"],
  "trick": "La chía hace el yogurt más cremoso y agrega fibra. La miel se pone solo arriba para sentir el dulce sin pasarse."
}, {
  "id": "d08",
  "name": "Tostadas francesas proteicas",
  "emoji": "🍞",
  "category": "desayuno",
  "time": "15 min",
  "kcal": 380,
  "protein": 28,
  "carbs": 42,
  "fat": 12,
  "difficulty": "Fácil",
  "hidden": [],
  "benefits": ["Sabor a postre", "Alta proteína", "Saciante"],
  "description": "French toast con scoop de proteína en la mezcla. Sabe a desayuno de hotel.",
  "ingredients": ["3 rebanadas pan integral", "2 huevos", "1/2 scoop proteína vainilla", "1/4 taza leche almendra", "1 cdita canela", "1/2 cdita vainilla", "Pizca de sal", "Spray para sartén", "Para servir: berries, miel maple sin azúcar, yogurt griego"],
  "steps": ["Bate huevos, proteína, leche, canela, vainilla y sal hasta que quede lisa", "Remoja cada rebanada de pan 10 segundos por lado", "Calienta sartén antiadherente con spray", "Cocina cada rebanada 2 min por lado hasta dorar", "Sirve con berries, yogurt griego encima y un toque de maple"],
  "trick": "Mezclar la proteína con los huevos antes de remojar el pan agrega 20g extra de proteína sin afectar el sabor."
}, {
  "id": "d09",
  "name": "Quesadilla de pollo con guacamole",
  "emoji": "🫓",
  "category": "desayuno",
  "time": "15 min",
  "kcal": 440,
  "protein": 34,
  "carbs": 35,
  "fat": 18,
  "difficulty": "Fácil",
  "hidden": ["aguacate"],
  "benefits": ["Grasas buenas", "Saciante", "Mexicano"],
  "description": "Quesadilla crujiente con pollo, queso oaxaca y guacamole cremoso al lado.",
  "ingredients": ["2 tortillas de maíz", "100g pollo cocido deshebrado", "1/4 taza queso oaxaca", "1/2 aguacate", "1 cda cebolla picada", "Cilantro", "Limón", "Sal, pimienta", "Salsa al gusto"],
  "steps": ["Mezcla aguacate machacado con cebolla, cilantro, limón y sal para guacamole", "Calienta tortillas en comal", "Pon queso y pollo en una mitad, cierra y aplasta ligeramente", "Cocina 2 min por lado hasta que el queso se derrita y la tortilla dore", "Sirve con guacamole y salsa al lado"],
  "trick": "El aguacate no se 'esconde' aquí pero es la única 'verdura' de la receta y va como salsa, no como ensalada."
}, {
  "id": "d10",
  "name": "Omelette de jamón y queso",
  "emoji": "🍳",
  "category": "desayuno",
  "time": "10 min",
  "kcal": 390,
  "protein": 32,
  "carbs": 12,
  "fat": 24,
  "difficulty": "Fácil",
  "hidden": ["pimiento", "cebolla"],
  "benefits": ["Alta proteína", "Bajo carbo", "Rápido"],
  "description": "Omelette esponjoso estilo francés con jamón y queso oaxaca derretido.",
  "ingredients": ["3 huevos", "60g jamón de pavo picado", "1/3 taza queso oaxaca o gruyère rallado", "1 cda pimiento rojo picado finísimo", "1 cda cebollín", "Sal, pimienta", "1 cdita mantequilla", "Pan tostado para acompañar"],
  "steps": ["Pica el pimiento súper fino y sofríelo 1 min en mantequilla con cebollín", "Bate huevos con sal y pimienta", "Vierte huevos en sartén caliente, mueve 30 seg para distribuir", "Cuando casi cuajen, pon jamón y queso en una mitad", "Dobla con espátula y deja 30 seg más para que se derrita el queso", "Sirve con pan tostado"],
  "trick": "El pimiento sofrito en mantequilla queda suave y aporta dulzor sin textura crujiente."
}, {
  "id": "c01",
  "name": "Spaghetti boloñesa con verduras escondidas",
  "emoji": "🍝",
  "category": "comida",
  "time": "30 min",
  "kcal": 480,
  "protein": 32,
  "carbs": 52,
  "fat": 14,
  "difficulty": "Fácil",
  "hidden": ["zanahoria", "apio", "calabacita", "espinaca"],
  "benefits": ["Alta proteína", "Fibra escondida", "Carbos lentos"],
  "description": "Pasta clásica donde la salsa lleva 5 verduras licuadas. No las ves, no las pruebas.",
  "ingredients": ["200g carne molida 90% magra", "200g pasta integral", "2 jitomates grandes maduros", "1 zanahoria mediana", "1 rama de apio", "1/2 calabacita", "1 puño de espinaca baby", "1/2 cebolla blanca", "2 dientes de ajo", "1 cda aceite de oliva", "Sal, pimienta, orégano, albahaca", "Queso parmesano"],
  "steps": ["Pon a hervir agua con sal para la pasta", "En la licuadora: jitomate, zanahoria, apio, calabacita, espinaca, ajo, cebolla. 1 min hasta salsa roja sin grumos", "Sofríe la carne en sartén con aceite hasta dorar 5 min", "Agrega la salsa licuada a la carne. Sazona con sal, pimienta, orégano, albahaca", "Cocina a fuego medio 15-20 min hasta que espese", "Hierve la pasta al dente según el paquete", "Sirve la pasta con la salsa y parmesano rallado"],
  "trick": "La zanahoria da dulzor natural, la espinaca da color profundo, el apio da sabor umami."
}, {
  "id": "c02",
  "name": "Albóndigas en chipotle con arroz",
  "emoji": "🍲",
  "category": "comida",
  "time": "40 min",
  "kcal": 520,
  "protein": 36,
  "carbs": 48,
  "fat": 18,
  "difficulty": "Media",
  "hidden": ["zanahoria", "calabacita", "cebolla"],
  "benefits": ["Proteína alta", "Comfort food", "Sabor mexicano"],
  "description": "Albóndigas mexicanas en salsa de chipotle. La carne lleva calabacita rallada.",
  "ingredients": ["400g carne molida (mitad res, mitad cerdo)", "1/2 calabacita rallada exprimida", "1/4 cebolla picada finita", "1 huevo", "2 cdas arroz crudo", "Sal y pimienta", "SALSA:", "4 jitomates", "1 zanahoria", "1 cebolla", "2 chipotles en adobo", "1 ajo", "Caldo de pollo, sal, comino", "Arroz blanco para servir"],
  "steps": ["Mezcla la carne con calabacita exprimida, cebolla, huevo, arroz, sal y pimienta", "Forma 16 albóndigas", "Licúa la salsa: jitomate, zanahoria, cebolla, chipotle, ajo, caldo, especias", "Vierte la salsa en olla. Hierve 5 min", "Agrega las albóndigas. Tapa y cocina 25 min a fuego medio-bajo", "Sirve con arroz blanco"],
  "trick": "El chipotle disfraza cualquier sabor 'verdoso'. La calabacita rallada y exprimida desaparece en la carne."
}, {
  "id": "c03",
  "name": "Pollo en mole rojo con arroz",
  "emoji": "🍗",
  "category": "comida",
  "time": "50 min",
  "kcal": 540,
  "protein": 38,
  "carbs": 52,
  "fat": 18,
  "difficulty": "Media",
  "hidden": ["jitomate", "cebolla", "ajo"],
  "benefits": ["Sabor mexicano", "Proteína completa", "Tradicional"],
  "description": "Pollo bañado en mole rojo casero. Comfort food familiar mexicano.",
  "ingredients": ["2 pechugas de pollo", "2 jitomates", "1/2 cebolla", "2 ajos", "2 cdas pasta de mole rojo", "1 taza caldo de pollo", "1 cda chocolate amargo", "1 cdita ajonjolí", "Sal", "Arroz blanco", "Tortillas"],
  "steps": ["Cuece las pechugas en agua con sal hasta que estén suaves", "Asa los jitomates, cebolla y ajo en comal hasta que se quemen un poco", "Licúa con la pasta de mole y un poco de caldo", "Calienta la mezcla en olla, agrega más caldo y el chocolate", "Hierve 15 min revolviendo hasta que espese", "Agrega las pechugas para que tomen sabor", "Sirve con arroz, ajonjolí encima y tortillas"],
  "trick": "El chocolate amargo profundiza el sabor del mole. Asar las verduras antes de licuar les quita el 'sabor a verde'."
}, {
  "id": "c04",
  "name": "Lasaña de carne con vegetales licuados",
  "emoji": "🥘",
  "category": "comida",
  "time": "60 min",
  "kcal": 550,
  "protein": 35,
  "carbs": 48,
  "fat": 22,
  "difficulty": "Media",
  "hidden": ["espinaca", "zanahoria", "jitomate", "calabacita"],
  "benefits": ["Comida completa", "4 verduras escondidas", "Familiar"],
  "description": "Lasaña tradicional pero con todas las verduras licuadas en la salsa.",
  "ingredients": ["9 láminas de pasta para lasaña", "400g carne molida res", "4 jitomates", "2 zanahorias", "1 calabacita", "2 puños espinaca", "1/2 cebolla", "3 dientes de ajo", "300g queso ricotta", "200g mozzarella rallada", "50g parmesano", "Albahaca, orégano, sal, pimienta"],
  "steps": ["Licúa: jitomate, zanahoria, calabacita, espinaca, cebolla, ajo. Queda salsa roja", "Sofríe la carne molida 5 min, agrega la salsa licuada y especias. Cocina 20 min", "Hierve las láminas de pasta según paquete. Escurre", "En refractario: capa de salsa, capa de pasta, capa de ricotta, capa de mozzarella. Repite 3 veces", "Termina con mozzarella y parmesano arriba", "Hornea a 180°C por 30 min hasta dorar"],
  "trick": "4 verduras desaparecen en la salsa. Sabe a lasaña italiana de restaurante."
}, {
  "id": "c05",
  "name": "Pollo a la crema estilo Toscana",
  "emoji": "🍗",
  "category": "comida",
  "time": "25 min",
  "kcal": 480,
  "protein": 38,
  "carbs": 32,
  "fat": 22,
  "difficulty": "Fácil",
  "hidden": ["espinaca", "champiñón"],
  "benefits": ["Cremoso", "Hierro", "Italiano"],
  "description": "Pollo en salsa cremosa estilo restaurante italiano. La salsa lleva espinaca licuada.",
  "ingredients": ["2 pechugas en filetes", "2 puños espinaca baby", "100g champiñones", "1/2 cebolla", "2 ajos", "200ml crema light", "100ml caldo pollo", "1/4 taza parmesano", "1 cda aceite oliva", "Sal, pimienta, paprika, tomillo", "Pasta o arroz para servir"],
  "steps": ["Sazona el pollo con sal, pimienta, paprika. Sella en sartén 4 min por lado. Reserva", "En la misma sartén sofríe cebolla y ajo 2 min", "Agrega espinaca y champiñones. Cocina 4 min hasta reducir", "Pasa todo a la licuadora con caldo. Licúa 30 seg", "Regresa a sartén. Agrega crema y parmesano. Hierve 3 min", "Regresa el pollo y cocina 5 min más", "Sirve con pasta o arroz"],
  "trick": "Los champiñones licuados dan profundidad de sabor. La espinaca se vuelve invisible al licuarla con crema."
}, {
  "id": "c06",
  "name": "Tacos de carne asada con guacamole",
  "emoji": "🌮",
  "category": "comida",
  "time": "25 min",
  "kcal": 510,
  "protein": 36,
  "carbs": 42,
  "fat": 20,
  "difficulty": "Fácil",
  "hidden": ["aguacate", "jitomate", "cebolla"],
  "benefits": ["Mexicano", "Alta proteína", "Familiar"],
  "description": "Tacos clásicos con carne asada jugosa y guacamole hecho al momento.",
  "ingredients": ["300g arrachera", "6 tortillas de maíz", "1 aguacate", "2 jitomates", "1/4 cebolla", "1 limón", "Cilantro", "Sal, pimienta, ajo en polvo", "Salsa al gusto", "Frijoles refritos para acompañar"],
  "steps": ["Sazona la arrachera con sal, pimienta, ajo en polvo", "Asa en plancha o sartén caliente 3-4 min por lado", "Reposa 5 min y corta en tiras", "Mezcla aguacate machacado con jitomate picado, cebolla, cilantro, limón y sal", "Calienta tortillas en comal", "Arma tacos con carne y guacamole encima", "Sirve con frijoles refritos y salsa"],
  "trick": "El guacamole con jitomate y cebolla es la única 'verdura' visible y la mayoría la come sin problema porque va con el aguacate."
}, {
  "id": "c07",
  "name": "Bistec encebollado con frijoles",
  "emoji": "🥩",
  "category": "comida",
  "time": "25 min",
  "kcal": 520,
  "protein": 42,
  "carbs": 38,
  "fat": 18,
  "difficulty": "Fácil",
  "hidden": ["cebolla"],
  "benefits": ["Hierro alto", "Tradicional", "Saciante"],
  "description": "Bistec sellado con cebolla caramelizada y frijoles negros. Comida del día clásica.",
  "ingredients": ["2 bisteces res 200g cada uno", "2 cebollas grandes en julianas", "2 ajos picados", "1/2 taza caldo res", "1 cda salsa inglesa", "1 cda aceite", "Sal, pimienta", "1 taza frijoles negros refritos", "Tortillas", "Aguacate para servir"],
  "steps": ["Sazona los bisteces con sal y pimienta", "Sella en sartén caliente con aceite 2 min por lado. Reserva", "En la misma sartén sofríe la cebolla a fuego bajo 10 min hasta caramelizar", "Agrega ajo y cocina 1 min más", "Vierte caldo y salsa inglesa. Hierve 2 min", "Regresa los bisteces para que tomen sabor 2 min", "Sirve con frijoles refritos, tortillas y aguacate"],
  "trick": "La cebolla caramelizada es dulce y suave, no sabe a 'cebolla cruda'. Quien dice que no le gusta la cebolla la come sin problema así."
}, {
  "id": "c08",
  "name": "Pechuga rellena de queso y jamón",
  "emoji": "🍗",
  "category": "comida",
  "time": "35 min",
  "kcal": 480,
  "protein": 48,
  "carbs": 22,
  "fat": 22,
  "difficulty": "Media",
  "hidden": ["espinaca"],
  "benefits": ["Proteína altísima", "Jugoso", "Elegante"],
  "description": "Pechuga rellena tipo cordon bleu pero más ligero. Espinaca dentro se funde con queso.",
  "ingredients": ["2 pechugas de pollo", "100g queso manchego", "60g jamón de pavo", "1 puño espinaca baby", "Sal, pimienta, paprika, ajo en polvo", "2 cdas pan molido", "1 huevo", "2 cdas aceite", "Arroz para acompañar"],
  "steps": ["Abre las pechugas tipo libro y aplánalas con martillo", "Sazona con sal, pimienta, paprika, ajo", "Pon dentro: queso, jamón, espinaca", "Cierra y asegura con palillos", "Pasa por huevo batido y luego pan molido", "Dora en sartén con aceite 4 min por lado", "Termina en horno a 180°C por 12 min", "Sirve con arroz"],
  "trick": "La espinaca dentro se cocina con el calor y se mezcla con el queso derretido. Solo agrega humedad y color."
}, {
  "id": "c09",
  "name": "Pasta carbonara con pollo",
  "emoji": "🍝",
  "category": "comida",
  "time": "20 min",
  "kcal": 540,
  "protein": 35,
  "carbs": 52,
  "fat": 22,
  "difficulty": "Fácil",
  "hidden": [],
  "benefits": ["Cremoso", "Italiano", "Alta proteína"],
  "description": "Carbonara clásica con pechuga de pollo. Salsa cremosa de huevo y queso.",
  "ingredients": ["200g pasta (espagueti o linguine)", "1 pechuga de pollo en cubos", "100g tocino o panceta", "2 huevos", "1/3 taza parmesano rallado", "2 ajos", "Sal, pimienta negra", "Perejil para decorar"],
  "steps": ["Hierve pasta al dente. Reserva 1/2 taza del agua", "Sazona pollo con sal y pimienta. Sella en sartén 5 min hasta dorar. Reserva", "En la misma sartén dora el tocino hasta crujiente", "Agrega ajo picado 30 seg", "Bate huevos con parmesano y mucha pimienta negra", "Apaga el fuego, agrega la pasta caliente al sartén", "Vierte el huevo batido y revuelve rápido (el calor residual lo cocina sin cuajar)", "Si está seco, agrega agua de pasta", "Incorpora el pollo y sirve con perejil"],
  "trick": "Apagar el fuego antes del huevo es clave para que quede cremoso, no revuelto. Receta sin verdura, pura proteína y carbo."
}, {
  "id": "c10",
  "name": "Chiles rellenos de queso",
  "emoji": "🌶",
  "category": "comida",
  "time": "45 min",
  "kcal": 480,
  "protein": 24,
  "carbs": 42,
  "fat": 24,
  "difficulty": "Media",
  "hidden": ["jitomate", "cebolla"],
  "benefits": ["Mexicano", "Cremoso", "Familiar"],
  "description": "Chiles poblanos rellenos de queso oaxaca con caldillo de jitomate suave.",
  "ingredients": ["4 chiles poblanos", "250g queso oaxaca", "3 huevos", "1/4 taza harina", "Aceite para freír", "CALDILLO:", "4 jitomates", "1/4 cebolla", "1 ajo", "Caldo de pollo, sal", "Arroz blanco para servir"],
  "steps": ["Asa los chiles directo en la flama hasta tatemarlos", "Mete en bolsa cerrada 10 min para que suden", "Pélalos y haz un corte para sacar las semillas (sin romperlos)", "Rellena con queso", "Bate las claras a punto de nieve, integra las yemas", "Pasa los chiles por harina y luego por huevo", "Fríe en aceite caliente hasta dorar", "CALDILLO: Licúa jitomate, cebolla, ajo. Hierve 10 min con caldo y sal", "Sirve los chiles bañados en caldillo con arroz"],
  "trick": "El caldillo lleva las verduras licuadas. Los chiles poblanos no pican (asegúrate que sean chiles poblanos no anchos)."
}, {
  "id": "e01",
  "name": "Pizza saludable de masa de coliflor",
  "emoji": "🍕",
  "category": "cena",
  "time": "35 min",
  "kcal": 380,
  "protein": 28,
  "carbs": 28,
  "fat": 18,
  "difficulty": "Media",
  "hidden": ["coliflor"],
  "benefits": ["Sin gluten", "Bajo carbo", "Cena ligera"],
  "description": "Pizza con masa de coliflor que NO sabe a coliflor. Crujiente como pizza normal.",
  "ingredients": ["1 coliflor mediana", "1 huevo", "1/2 taza mozzarella rallada", "1/4 taza parmesano", "1 cdita orégano", "Sal, ajo en polvo", "TOPPINGS:", "1/2 taza salsa de tomate", "100g mozzarella", "100g pollo desmenuzado o pepperoni light", "Albahaca fresca"],
  "steps": ["Ralla la coliflor en procesador o con rallador hasta que quede como arroz", "Mete al microondas 5 min. Cuando enfríe, exprime con un trapo TODA el agua", "Mezcla con huevo, quesos, orégano, sal, ajo", "Extiende sobre papel para horno formando pizza de 25cm", "Hornea a 220°C por 15 min hasta dorar", "Saca, agrega salsa, queso, toppings", "Hornea 8 min más"],
  "trick": "Exprimir BIEN el agua de la coliflor es lo más importante. Si queda húmeda, sabe a coliflor."
}, {
  "id": "e02",
  "name": "Hamburguesas jugosas con verdura oculta",
  "emoji": "🍔",
  "category": "cena",
  "time": "25 min",
  "kcal": 520,
  "protein": 35,
  "carbs": 35,
  "fat": 22,
  "difficulty": "Fácil",
  "hidden": ["calabacita", "cebolla", "espinaca"],
  "benefits": ["Jugosa", "Fibra escondida", "Familiar"],
  "description": "Hamburguesas con calabacita rallada — más jugosas y fibra invisible.",
  "ingredients": ["300g carne molida res 80/20", "1/2 calabacita rallada y exprimida", "1/4 cebolla picada finita", "1 puño espinaca picada finísima", "1 huevo", "2 cdas pan molido", "1 cdita salsa inglesa", "Sal, pimienta, ajo en polvo, paprika", "2 panes integrales", "Lechuga, jitomate, cebolla, mostaza, mayonesa light"],
  "steps": ["Ralla la calabacita y exprímela con las manos para sacar el agua", "Mezcla: carne, calabacita exprimida, cebolla, espinaca, huevo, pan molido, salsa inglesa, especias", "Forma 2 hamburguesas gruesas", "Calienta sartén o plancha a fuego alto", "Cocina 4 min de un lado, voltea, 4 min más", "Tuesta los panes ligeramente", "Arma con jitomate, lechuga (opcional), salsas"],
  "trick": "La calabacita rallada y exprimida desaparece dentro de la carne. Solo la hace más jugosa."
}, {
  "id": "e03",
  "name": "Pollo al curry coco con arroz",
  "emoji": "🍛",
  "category": "cena",
  "time": "30 min",
  "kcal": 520,
  "protein": 36,
  "carbs": 48,
  "fat": 18,
  "difficulty": "Fácil",
  "hidden": ["jitomate", "jengibre", "cebolla"],
  "benefits": ["Aromático", "Cremoso", "Especias antiinflamatorias"],
  "description": "Pollo en salsa cremosa de coco y curry. Sabor exótico y reconfortante.",
  "ingredients": ["2 pechugas en cubos", "1 lata leche de coco", "2 cdas pasta de curry rojo o amarillo", "2 jitomates", "1/2 cebolla", "2 ajos", "1 cm jengibre", "Caldo de pollo", "Sal, cilantro", "1 taza arroz basmati"],
  "steps": ["Licúa jitomate, cebolla, ajo y jengibre", "Sella el pollo en sartén con un toque de aceite 5 min. Reserva", "En la misma sartén calienta la pasta de curry 1 min", "Agrega la mezcla licuada y cocina 5 min", "Vierte la leche de coco y un poco de caldo", "Regresa el pollo. Cocina 15 min hasta espesar", "Sirve sobre arroz con cilantro encima"],
  "trick": "El curry y el coco dominan completamente. Las verduras licuadas solo dan cuerpo a la salsa."
}, {
  "id": "e04",
  "name": "Salmón... no espera, pescado al horno",
  "emoji": "🐟",
  "category": "cena",
  "time": "25 min",
  "kcal": 420,
  "protein": 38,
  "carbs": 18,
  "fat": 22,
  "difficulty": "Fácil",
  "hidden": [],
  "benefits": ["Omega 3", "Bajo carbo", "Cena ligera"],
  "description": "Filete de mojarra o robalo con costra de hierbas y limón. Pescado que NO es salmón.",
  "ingredients": ["2 filetes de robalo o mojarra (200g cada uno)", "2 cdas pan molido", "2 cdas parmesano", "1 cda perejil picado", "1 ajo picado", "Ralladura de 1 limón", "2 cdas aceite oliva", "Sal, pimienta", "1 limón en gajos", "Arroz para servir"],
  "steps": ["Precalienta horno a 200°C", "Mezcla pan molido, parmesano, perejil, ajo, ralladura de limón, aceite", "Pon los filetes en charola con papel para horno", "Sazona con sal y pimienta", "Cubre con la mezcla de pan molido", "Hornea 12-15 min hasta que el pescado se desmenuze fácil", "Sirve con gajos de limón y arroz"],
  "trick": "El robalo y mojarra son pescados blancos suaves, MUY diferentes al salmón. Sabor neutro, costra crujiente."
}, {
  "id": "e05",
  "name": "Sopa cremosa de pollo con tortilla",
  "emoji": "🍜",
  "category": "cena",
  "time": "30 min",
  "kcal": 420,
  "protein": 34,
  "carbs": 35,
  "fat": 15,
  "difficulty": "Fácil",
  "hidden": ["jitomate", "cebolla", "chile"],
  "benefits": ["Reconfortante", "Hidratante", "Mexicano"],
  "description": "Sopa azteca cremosa con pollo y tortilla frita. Caldo lleno de sabor.",
  "ingredients": ["1 pechuga de pollo cocida y deshebrada", "4 jitomates", "1/4 cebolla", "2 ajos", "1 chile pasilla seco", "6 tazas caldo de pollo", "2 tortillas en tiras y fritas", "Aguacate", "Queso fresco", "Crema", "Cilantro"],
  "steps": ["Asa los jitomates, cebolla y ajo en comal", "Hidrata el chile pasilla en agua caliente 5 min", "Licúa todo con un poco de caldo", "Cocina la salsa licuada en olla 5 min", "Agrega el caldo y el pollo deshebrado", "Hierve 10 min", "Sirve con tortilla frita encima, aguacate, queso, crema y cilantro"],
  "trick": "El chile pasilla da sabor profundo sin picar mucho. El caldo licuado se siente cremoso sin necesidad de crema."
}, {
  "id": "e06",
  "name": "Tacos de pescado con coleslaw cremoso",
  "emoji": "🌮",
  "category": "cena",
  "time": "20 min",
  "kcal": 480,
  "protein": 32,
  "carbs": 42,
  "fat": 18,
  "difficulty": "Fácil",
  "hidden": ["repollo", "zanahoria"],
  "benefits": ["Omega 3", "Crujiente", "Fresco"],
  "description": "Tacos estilo Baja con pescado empanizado y coleslaw cremoso (verduras picadas finas).",
  "ingredients": ["300g filete de pescado blanco", "1/2 taza pan molido", "1/4 taza harina", "1 huevo", "Sal, pimienta, paprika", "6 tortillas de maíz", "COLESLAW:", "1 taza repollo morado picado finísimo", "1/2 zanahoria rallada finísima", "2 cdas mayonesa", "1 cda yogurt griego", "1 cda jugo de limón", "Sal", "Para servir: aguacate, salsa picante"],
  "steps": ["Corta el pescado en tiras", "Pasa por harina, luego por huevo, luego por pan molido con paprika y sal", "Fríe en aceite caliente 3 min hasta dorar", "COLESLAW: pica el repollo finísimo, ralla zanahoria. Mezcla con mayo, yogurt, limón, sal. Reposa 10 min", "Calienta tortillas", "Arma tacos con pescado, coleslaw, aguacate", "Sirve con salsa picante"],
  "trick": "El coleslaw lleva las verduras picadas FINISIMAS y bañadas en mayo cremosa. Es como salsa, no se siente como ensalada."
}, {
  "id": "e07",
  "name": "Sushi rolls caseros de pollo y aguacate",
  "emoji": "🍣",
  "category": "cena",
  "time": "30 min",
  "kcal": 420,
  "protein": 28,
  "carbs": 52,
  "fat": 12,
  "difficulty": "Media",
  "hidden": [],
  "benefits": ["Divertido", "Bajo grasa", "Original"],
  "description": "Sushi casero estilo California con pollo, queso crema y aguacate. Sin pescado crudo.",
  "ingredients": ["1 taza arroz para sushi cocido", "2 cdas vinagre arroz", "1 pechuga de pollo cocida", "1/2 aguacate en tiras", "2 cdas queso crema", "100g queso crema light", "2 hojas alga nori", "Salsa de soya", "Wasabi (opcional)", "Jengibre encurtido"],
  "steps": ["Mezcla arroz cocido con vinagre", "Coloca alga nori en tapete de bambú", "Extiende capa fina de arroz dejando 2cm sin cubrir en un extremo", "Pon tiras de pollo, aguacate y queso crema", "Enrolla apretado con el tapete", "Corta en 8 piezas con cuchillo mojado", "Sirve con soya, wasabi y jengibre"],
  "trick": "Sushi sin pescado crudo y con sabores que conoces. Aguacate y queso crema son la única 'verdura' suave."
}, {
  "id": "e08",
  "name": "Quesadillas de hongos con queso oaxaca",
  "emoji": "🫓",
  "category": "cena",
  "time": "15 min",
  "kcal": 420,
  "protein": 22,
  "carbs": 38,
  "fat": 22,
  "difficulty": "Fácil",
  "hidden": ["champiñón", "epazote"],
  "benefits": ["Vegetariano", "Rápido", "Sabor mexicano"],
  "description": "Quesadillas con hongos guisados estilo mexicano y queso oaxaca derretido.",
  "ingredients": ["4 tortillas grandes", "200g hongos rebanados", "200g queso oaxaca", "1/4 cebolla picada", "1 ajo picado", "2 hojas epazote", "1 chile serrano picado finito (opcional)", "Sal", "Aceite", "Salsa al gusto"],
  "steps": ["Sofríe cebolla y ajo en aceite 2 min", "Agrega hongos rebanados, sal y epazote", "Cocina 8 min hasta que reduzcan y doren", "Si quieres picante, agrega chile serrano", "Calienta tortilla en comal", "Pon queso y hongos en una mitad", "Cierra y cocina 2 min por lado", "Sirve con salsa"],
  "trick": "Los hongos guisados así saben a carne. El epazote es muy mexicano y no sabe a 'verde'."
}, {
  "id": "e09",
  "name": "Wrap de pavo y aguacate",
  "emoji": "🌯",
  "category": "cena",
  "time": "10 min",
  "kcal": 420,
  "protein": 32,
  "carbs": 38,
  "fat": 15,
  "difficulty": "Fácil",
  "hidden": [],
  "benefits": ["Rápido", "Portátil", "Equilibrado"],
  "description": "Wrap rápido con pavo, queso, aguacate y mayonesa de chipotle. Cena lista en 10 min.",
  "ingredients": ["1 tortilla integral grande", "100g pavo en rebanadas", "1 rebanada queso panela o manchego", "1/2 aguacate en rebanadas", "1 cda mayonesa", "1/2 chipotle en adobo picado", "Sal", "1/4 jitomate en rebanadas finas (opcional)"],
  "steps": ["Mezcla mayonesa con chipotle picado", "Calienta la tortilla 30 seg en comal", "Unta la mayonesa de chipotle", "Acomoda pavo, queso, aguacate y jitomate", "Sazona con sal", "Enrolla apretado y corta a la mitad", "Sirve frío o caliente"],
  "trick": "La mayo de chipotle hace que sepa a algo elaborado en 10 minutos. El aguacate da cremosidad sin nada que se sienta a verdura."
}, {
  "id": "e10",
  "name": "Pollo asado con puré de papa",
  "emoji": "🍗",
  "category": "cena",
  "time": "35 min",
  "kcal": 520,
  "protein": 38,
  "carbs": 48,
  "fat": 18,
  "difficulty": "Fácil",
  "hidden": ["coliflor"],
  "benefits": ["Familiar", "Comfort food", "Saciante"],
  "description": "Pollo dorado con puré cremoso. El puré lleva 50% coliflor pero no se nota.",
  "ingredients": ["2 muslos o piernas de pollo", "Sal, pimienta, paprika, ajo en polvo", "1 cda mantequilla", "PURÉ:", "2 papas medianas", "1/2 coliflor mediana", "1/4 taza leche tibia", "2 cdas mantequilla", "1/4 taza queso parmesano", "Sal, pimienta blanca, nuez moscada"],
  "steps": ["Sazona el pollo. Hornea 30 min a 200°C con mantequilla por encima", "PURÉ: cuece papas y coliflor en agua con sal hasta blandas (15 min)", "Escurre BIEN (importante para que el puré no quede aguado)", "Aplasta o licúa con leche, mantequilla, parmesano, nuez moscada", "Sazona con sal y pimienta blanca", "Sirve el pollo con puré al lado"],
  "trick": "La coliflor cocida y aplastada se mezcla totalmente con la papa. La nuez moscada y el parmesano disfrazan completamente el sabor."
}, {
  "id": "s01",
  "name": "Smoothie verde sabor piña colada",
  "emoji": "🥤",
  "category": "snack",
  "time": "5 min",
  "kcal": 280,
  "protein": 22,
  "carbs": 32,
  "fat": 8,
  "difficulty": "Fácil",
  "hidden": ["espinaca", "aguacate"],
  "benefits": ["Antioxidantes", "Grasas buenas", "Refrescante"],
  "description": "Espinaca + aguacate dentro de un smoothie que sabe a piña colada.",
  "ingredients": ["1 puño espinaca baby", "1/4 aguacate maduro", "1/2 plátano congelado", "1/2 taza piña en cubos", "1 taza leche de almendra sin azúcar", "1 scoop proteína vainilla", "1 cdita coco rallado", "Hielo al gusto"],
  "steps": ["Pon todo en la licuadora", "Licúa 1 min a velocidad alta hasta súper cremoso", "Sirve frío"],
  "trick": "La piña enmascara totalmente la espinaca. El aguacate da cremosidad sin sabor."
}, {
  "id": "s02",
  "name": "Brownies con frijol negro",
  "emoji": "🍫",
  "category": "snack",
  "time": "40 min",
  "kcal": 180,
  "protein": 8,
  "carbs": 22,
  "fat": 8,
  "difficulty": "Fácil",
  "hidden": ["frijol negro"],
  "benefits": ["Proteína", "Fibra", "Sin harina"],
  "description": "Brownies fudgy súper chocolatosos. Llevan frijol negro en lugar de harina.",
  "ingredients": ["1 lata de frijoles negros (escurridos y enjuagados)", "3 huevos", "1/3 taza cocoa sin azúcar", "1/3 taza miel de agave", "1/4 taza aceite de coco derretido", "1 cdita esencia de vainilla", "1/2 cdita polvo para hornear", "Pizca de sal", "1/2 taza chispas chocolate amargo"],
  "steps": ["Precalienta horno a 180°C", "En licuadora: procesa los frijoles bien escurridos hasta puré", "Agrega huevos, cocoa, agave, aceite, vainilla, polvo, sal. Licúa 30 seg", "Incorpora chispas con espátula", "Vierte en molde 20×20cm engrasado", "Hornea 25-28 min", "Deja enfriar antes de cortar"],
  "trick": "El cocoa amargo y el chocolate dominan completamente. Sirve fríos."
}, {
  "id": "s03",
  "name": "Hummus de frijol con totopos",
  "emoji": "🫘",
  "category": "snack",
  "time": "10 min",
  "kcal": 280,
  "protein": 12,
  "carbs": 35,
  "fat": 12,
  "difficulty": "Fácil",
  "hidden": ["ajo"],
  "benefits": ["Fibra", "Proteína vegetal", "Mexicano"],
  "description": "Hummus mexicano con frijoles negros en lugar de garbanzo. Cremoso, con totopos.",
  "ingredients": ["1 lata frijoles negros escurridos", "2 cdas tahini", "2 ajos", "Jugo de 1 limón", "2 cdas aceite oliva", "1/2 cdita comino", "Sal", "Para servir: totopos integrales, paprika"],
  "steps": ["Licúa frijoles, tahini, ajo, limón, aceite, comino, sal", "Procesa hasta que quede súper cremoso (1-2 min)", "Si está espeso, agrega un poco de agua", "Sirve en bowl con un hilo de aceite y paprika", "Acompaña con totopos integrales"],
  "trick": "El comino y limón disfrazan el sabor a frijol y lo hace tipo hummus mediterráneo."
}, {
  "id": "s04",
  "name": "Mug cake de chocolate proteico",
  "emoji": "🍫",
  "category": "snack",
  "time": "3 min",
  "kcal": 250,
  "protein": 24,
  "carbs": 28,
  "fat": 7,
  "difficulty": "Fácil",
  "hidden": [],
  "benefits": ["Postre", "Alta proteína", "Rápido"],
  "description": "Pastel de chocolate en taza, listo en 90 segundos. 24g proteína.",
  "ingredients": ["1 scoop proteína chocolate", "1 cda cocoa", "2 cdas avena en polvo", "1 cdita polvo para hornear", "1/4 taza leche almendra", "1 huevo", "1 cdita miel agave", "Pizca sal", "2 cdas chispas chocolate"],
  "steps": ["Mezcla todo en una taza grande con tenedor", "Asegúrate que no queden grumos", "Microondas 90 segundos", "Deja reposar 30 seg", "Come tibio con cuchara"],
  "trick": "El cocoa amargo + proteína de chocolate hacen que sepa a brownie sin sentir 'a proteína'."
}, {
  "id": "s05",
  "name": "Edamames con sal de mar",
  "emoji": "🫛",
  "category": "snack",
  "time": "5 min",
  "kcal": 180,
  "protein": 17,
  "carbs": 15,
  "fat": 7,
  "difficulty": "Fácil",
  "hidden": [],
  "benefits": ["Proteína vegetal", "Fibra", "Bajo grasa"],
  "description": "Edamames japoneses con sal de mar. Snack proteico y entretenido para botanear.",
  "ingredients": ["1 taza edamames congelados (con vaina)", "2 tazas agua", "Sal de mar gruesa", "Salsa de soya (opcional)", "Limón (opcional)"],
  "steps": ["Hierve agua en olla", "Agrega edamames y cocina 4-5 min", "Escurre", "Esparce con sal de mar gruesa", "Sirve calientes", "Comes apretando la vaina con los dientes para sacar las semillas"],
  "trick": "La textura de morder la vaina es divertida y te tarda más, te sacia psicológicamente con pocas calorías."
}, {
  "id": "s06",
  "name": "Yogurt griego con miel y nueces",
  "emoji": "🥛",
  "category": "snack",
  "time": "2 min",
  "kcal": 280,
  "protein": 22,
  "carbs": 24,
  "fat": 12,
  "difficulty": "Fácil",
  "hidden": [],
  "benefits": ["Probióticos", "Rápido", "Saciante"],
  "description": "Snack rápido y elegante. Yogurt griego cremoso con nueces caramelizadas.",
  "ingredients": ["200g yogurt griego natural", "1 cda miel", "1 cda nueces de Castilla picadas", "1/2 cdita canela", "2 fresas en rebanadas", "Pizca de sal de mar"],
  "steps": ["Sirve el yogurt en bowl", "Espolvorea canela", "Vierte la miel encima", "Decora con fresas y nueces", "Pizca de sal de mar para resaltar el dulce"],
  "trick": "La sal de mar arriba hace que el dulce sepa más profundo. Truco de pastelería gourmet."
}, {
  "id": "s07",
  "name": "Galletas de avena y plátano",
  "emoji": "🍪",
  "category": "snack",
  "time": "20 min",
  "kcal": 140,
  "protein": 6,
  "carbs": 22,
  "fat": 4,
  "difficulty": "Fácil",
  "hidden": [],
  "benefits": ["Sin azúcar", "Fibra", "Para llevar"],
  "description": "Galletas blanditas hechas con plátano. Solo 3 ingredientes base. Sin azúcar.",
  "ingredients": ["2 plátanos maduros machacados", "1 taza avena en hojuelas", "1/4 taza chispas de chocolate", "1 cdita canela", "1 cda mantequilla de almendra", "Pizca sal", "Opcional: pasas, nueces, semillas"],
  "steps": ["Precalienta horno a 180°C", "Machaca los plátanos", "Mezcla con avena, chispas, canela, mantequilla almendra, sal", "Forma 12 galletas con cuchara en charola con papel para horno", "Hornea 15 min", "Deja enfriar 5 min antes de mover"],
  "trick": "El plátano maduro funciona como azúcar y aglutinante. Perfecto para llevar al trabajo."
}, {
  "id": "s08",
  "name": "Bocadillos de jamón y queso",
  "emoji": "🍖",
  "category": "snack",
  "time": "5 min",
  "kcal": 220,
  "protein": 18,
  "carbs": 3,
  "fat": 15,
  "difficulty": "Fácil",
  "hidden": [],
  "benefits": ["Bajo carbo", "Alta proteína", "Rápido"],
  "description": "Rollitos de jamón con queso crema y especias. Snack keto rápido.",
  "ingredients": ["6 rebanadas jamón de pavo", "100g queso crema", "1 cdita eneldo o cebollín picado", "Pimienta negra", "2 cdas semillas de sésamo (opcional)"],
  "steps": ["Mezcla queso crema con eneldo y pimienta", "Extiende sobre cada rebanada de jamón", "Enrolla apretado", "Pasa los rollos por sésamo si quieres", "Refrigera 10 min para que tomen forma", "Corta cada rollo en 3 piezas"],
  "trick": "El queso crema con eneldo da sabor gourmet. Snack ideal para no romper la dieta."
}, {
  "id": "s09",
  "name": "Trail mix casero",
  "emoji": "🥜",
  "category": "snack",
  "time": "5 min",
  "kcal": 260,
  "protein": 8,
  "carbs": 22,
  "fat": 18,
  "difficulty": "Fácil",
  "hidden": [],
  "benefits": ["Energía sostenida", "Grasas buenas", "Para viajes"],
  "description": "Mezcla de frutos secos, semillas y un toque dulce. Para tener en el coche.",
  "ingredients": ["1/4 taza almendras", "1/4 taza nueces", "2 cdas semillas calabaza", "2 cdas chispas chocolate amargo", "1/4 taza arándanos secos", "1 cda coco rallado", "Pizca sal de mar"],
  "steps": ["Mezcla todo en un bowl", "Distribuye en frasco hermético o bolsitas individuales", "Porción recomendada: 1/4 taza"],
  "trick": "Los arándanos y chocolate dan dulce sin azúcar añadida. Las semillas alargan la saciedad."
}, {
  "id": "s10",
  "name": "Pudín de chía sabor café",
  "emoji": "☕",
  "category": "snack",
  "time": "5 min + reposo",
  "kcal": 220,
  "protein": 12,
  "carbs": 22,
  "fat": 10,
  "difficulty": "Fácil",
  "hidden": [],
  "benefits": ["Omega 3", "Saciante", "Original"],
  "description": "Pudín de semillas de chía con café espresso. Sabe a tiramisú saludable.",
  "ingredients": ["3 cdas semillas de chía", "1 taza leche almendra", "1 cda café instantáneo", "1 cdita cocoa", "2 cditas miel agave", "1/2 scoop proteína vainilla", "Pizca sal", "Para servir: cocoa, granola"],
  "steps": ["Mezcla todo en frasco con tapa", "Agita bien por 30 segundos", "Reposa 5 min, agita otra vez para evitar grumos", "Refrigera mínimo 4 horas (mejor toda la noche)", "Sirve con cocoa espolvoreada y granola encima"],
  "trick": "El café y cocoa hacen que sepa a tiramisú. La chía absorbe líquido y crea textura cremosa de pudín."
}];
const FOOD_EMOJIS = {
  // Huevos y lácteos
  "huevo": "🥚",
  "huevos": "🥚",
  "huevo revuelto": "🍳",
  "huevos revueltos": "🍳",
  "huevo frito": "🍳",
  "omelette": "🍳",
  "tortilla de huevo": "🍳",
  "leche": "🥛",
  "yogurt": "🥛",
  "queso": "🧀",
  "mantequilla": "🧈",
  "crema": "🥛",
  "nata": "🥛",
  // Carnes
  "pollo": "🍗",
  "pechuga": "🍗",
  "pechuga de pollo": "🍗",
  "muslo de pollo": "🍗",
  "pierna de pollo": "🍗",
  "carne": "🥩",
  "res": "🥩",
  "bistec": "🥩",
  "carne de res": "🥩",
  "filete": "🥩",
  "milanesa": "🥩",
  "cerdo": "🥓",
  "tocino": "🥓",
  "jamón": "🍖",
  "costilla": "🍖",
  "chorizo": "🌭",
  "salchicha": "🌭",
  "hot dog": "🌭",
  "pepperoni": "🍕",
  "pavo": "🍗",
  "cordero": "🍖",
  "conejo": "🍖",
  // Mariscos y pescados
  "camarón": "🦐",
  "camarones": "🦐",
  "langosta": "🦞",
  "cangrejo": "🦀",
  "jaiba": "🦀",
  "pulpo": "🐙",
  "calamar": "🦑",
  "almeja": "🦪",
  "ostión": "🦪",
  "ostiones": "🦪",
  "salmón": "🐟",
  "atún": "🐟",
  "pescado": "🐟",
  "filete de pescado": "🐟",
  "tilapia": "🐟",
  "mojarra": "🐟",
  "robalo": "🐟",
  "sardina": "🐟",
  "anchoa": "🐟",
  "trucha": "🐟",
  "bagre": "🐟",
  // Frutas
  "manzana": "🍎",
  "pera": "🍐",
  "naranja": "🍊",
  "mandarina": "🍊",
  "limón": "🍋",
  "lima": "🍋",
  "plátano": "🍌",
  "banana": "🍌",
  "sandía": "🍉",
  "melón": "🍈",
  "uvas": "🍇",
  "uva": "🍇",
  "fresa": "🍓",
  "fresas": "🍓",
  "mango": "🥭",
  "piña": "🍍",
  "coco": "🥥",
  "cereza": "🍒",
  "durazno": "🍑",
  "melocotón": "🍑",
  "ciruela": "🍑",
  "kiwi": "🥝",
  "tomate": "🍅",
  "jitomate": "🍅",
  "aguacate": "🥑",
  "papaya": "🫐",
  "guayaba": "🍈",
  "granada": "🍎",
  "higo": "🍇",
  "tuna": "🌵",
  "mamey": "🍑",
  "zapote": "🍑",
  "tamarindo": "🌿",
  // Verduras
  "brócoli": "🥦",
  "brocoli": "🥦",
  "zanahoria": "🥕",
  "zanahorias": "🥕",
  "espinaca": "🥬",
  "espinacas": "🥬",
  "lechuga": "🥬",
  "pepino": "🥒",
  "calabaza": "🎃",
  "calabacita": "🥒",
  "elote": "🌽",
  "maíz": "🌽",
  "chile": "🌶",
  "chili": "🌶",
  "jalapeño": "🌶",
  "cebolla": "🧅",
  "ajo": "🧄",
  "papa": "🥔",
  "papas": "🥔",
  "camote": "🍠",
  "betabel": "🫀",
  "apio": "🥬",
  "col": "🥬",
  "repollo": "🥬",
  "coliflor": "🥦",
  "ejotes": "🫛",
  "chícharo": "🫛",
  "champiñón": "🍄",
  "hongos": "🍄",
  "nopales": "🌵",
  "nopal": "🌵",
  "chayote": "🥒",
  "jícama": "🥔",
  "rábano": "🔴",
  // Cereales y carbohidratos
  "arroz": "🍚",
  "tortilla": "🫓",
  "tortillas": "🫓",
  "pan": "🍞",
  "pan tostado": "🍞",
  "tostada": "🫓",
  "tostadas": "🫓",
  "cereal": "🥣",
  "avena": "🥣",
  "granola": "🥣",
  "pasta": "🍝",
  "espagueti": "🍝",
  "macarrón": "🍝",
  "fideo": "🍝",
  "galleta": "🍪",
  "galletas": "🍪",
  "pan dulce": "🥐",
  "croissant": "🥐",
  "waffle": "🧇",
  "hot cake": "🥞",
  "hotcake": "🥞",
  "tamal": "🫔",
  "tamales": "🫔",
  "quesadilla": "🫔",
  "enchilada": "🫔",
  "taco": "🌮",
  "tacos": "🌮",
  "burrito": "🌯",
  "sopa": "🍜",
  "pozole": "🍲",
  "menudo": "🍲",
  "chilaquiles": "🍳",
  "papa frita": "🍟",
  "papas fritas": "🍟",
  "pizza": "🍕",
  "hamburguesa": "🍔",
  "sandwich": "🥪",
  "torta": "🥪",
  // Leguminosas
  "frijoles": "🫘",
  "frijol": "🫘",
  "lentejas": "🫘",
  "garbanzo": "🫘",
  "garbanzos": "🫘",
  "soya": "🫘",
  // Frutos secos y semillas
  "almendra": "🌰",
  "almendras": "🌰",
  "nuez": "🌰",
  "nueces": "🌰",
  "cacahuate": "🥜",
  "cacahuates": "🥜",
  "pistache": "🌰",
  "piñón": "🌰",
  "semillas": "🌱",
  "chía": "🌱",
  "linaza": "🌱",
  // Bebidas
  "café": "☕",
  "agua": "💧",
  "jugo": "🧃",
  "leche descremada": "🥛",
  "té": "🍵",
  "refresco": "🥤",
  "soda": "🥤",
  "licuado": "🥤",
  "smoothie": "🥤",
  "proteína en polvo": "🥤",
  // Dulces y postres
  "chocolate": "🍫",
  "helado": "🍦",
  "pastel": "🎂",
  "pay": "🥧",
  "gelatina": "🍮",
  "flan": "🍮",
  "arroz con leche": "🍮",
  // Otros
  "aceite": "🫙",
  "miel": "🍯",
  "mermelada": "🍯",
  "salsa": "🫙",
  "guacamole": "🥑",
  "hummus": "🫘",
  "mayonesa": "🫙",
  "ketchup": "🍅",
  "mostaza": "🫙"
};
const getFoodEmoji = name => {
  if (!name) return "🍽️";
  const lower = name.toLowerCase().trim();
  // Direct match
  if (FOOD_EMOJIS[lower]) return FOOD_EMOJIS[lower];
  // Partial match - check if any key is contained in the name
  const keys = Object.keys(FOOD_EMOJIS);
  for (const key of keys) {
    if (lower.includes(key)) return FOOD_EMOJIS[key];
  }
  return "🍽️";
};
async function api(k, sys, msgs, max = 1200) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": k,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-opus-4-5-20251101",
      max_tokens: max,
      system: sys,
      messages: msgs
    })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content[0].text;
}
async function apiVision(k, sys, prompt, imageBase64, mediaType, max = 2000) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": k,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: max,
      system: sys,
      messages: [{
        role: "user",
        content: [{
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: imageBase64
          }
        }, {
          type: "text",
          text: prompt
        }]
      }]
    })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content[0].text;
}
async function apiVisionMulti(k, sys, prompt, photos, max = 2500) {
  const imageBlocks = photos.map(p => ({
    type: "image",
    source: {
      type: "base64",
      media_type: p.mediaType,
      data: p.base64
    }
  }));
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": k,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-opus-4-5-20251101",
      max_tokens: max,
      system: sys,
      messages: [{
        role: "user",
        content: [...imageBlocks, {
          type: "text",
          text: prompt
        }]
      }]
    })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content[0].text;
}
const safeGetLS = (k, fallback) => {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const v = localStorage.getItem(k);
    if (v === null || v === undefined) return fallback;
    return v;
  } catch (e) {
    return fallback;
  }
};
const safeGetLSJSON = (k, fallback) => {
  try {
    const v = safeGetLS(k, null);
    if (!v) return fallback;
    const parsed = JSON.parse(v);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (e) {
    return fallback;
  }
};
const safeSetLS = (k, v) => {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
  } catch (e) {/* quota exceeded or storage disabled */}
};
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    // For non-images (PDF, etc), use direct base64
    if (!file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const base64 = result.split(",")[1];
        const mediaType = result.split(";")[0].split(":")[1];
        resolve({
          base64,
          mediaType
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    // For images: compress to stay under API limits and improve speed
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        // Calculate new dimensions: max 1600px on longest side
        let {
          width,
          height
        } = img;
        const maxSize = 1600;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round(height * maxSize / width);
            width = maxSize;
          } else {
            width = Math.round(width * maxSize / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // Try progressively lower quality until under 4MB (safe margin under 5MB limit)
        const tryQuality = q => {
          const dataUrl = canvas.toDataURL("image/jpeg", q);
          const base64 = dataUrl.split(",")[1];
          const sizeBytes = base64.length * 0.75; // approximate size
          if (sizeBytes > 4 * 1024 * 1024 && q > 0.3) {
            return tryQuality(q - 0.1);
          }
          return {
            base64,
            mediaType: "image/jpeg"
          };
        };
        URL.revokeObjectURL(url);
        resolve(tryQuality(0.85));
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo cargar la imagen"));
    };
    img.src = url;
  });
}
const todayKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
};
const dateKey = d => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
};
const fmtDate = iso => {
  const d = new Date(iso + "T12:00:00");
  return DAYS[d.getDay()] + " " + d.getDate() + "/" + (d.getMonth() + 1);
};
const sumDay = entries => {
  const t = {
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    sugar: 0,
    fiber: 0,
    sodium: 0
  };
  (entries || []).forEach(e => {
    if (e && e.totals) Object.keys(t).forEach(k => {
      const v = Number(e.totals[k]);
      if (!isNaN(v)) t[k] += v;
    });
  });
  return t;
};

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

function Ring({
  value,
  max,
  size = 200,
  color = "#0891b2",
  thickness = 12,
  children
}) {
  const pct = Math.min(1, Math.max(0, value / max));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      width: size,
      height: size,
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    style: {
      transform: "rotate(-90deg)"
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: "var(--bg-sunken)",
    strokeWidth: thickness
  }), /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: color,
    strokeWidth: thickness,
    strokeLinecap: "round",
    strokeDasharray: c,
    strokeDashoffset: offset,
    style: {
      transition: "stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)",
      filter: "drop-shadow(0 0 8px " + color + "40)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center"
    }
  }, children));
}
function MacroRing({
  label,
  current,
  target,
  color,
  unit = "g",
  icon,
  onClick,
  isLimit
}) {
  const pct = target > 0 ? Math.min(1.5, current / target) : 0;
  const over = pct > 1.1;
  const short = !isLimit && pct < 0.7 && current > 0;
  const empty = current === 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(1, pct));

  // Status indicator (small dot)
  let statusColor = "var(--ink-mute)";
  let statusIcon = "";
  if (empty) {
    statusColor = "var(--ink-mute)";
  } else if (over) {
    statusColor = "var(--danger)";
    statusIcon = "↑";
  } else if (short) {
    statusColor = "var(--warn)";
    statusIcon = "↓";
  } else if (pct >= 0.85) {
    statusColor = "var(--mint-deep)";
    statusIcon = "✓";
  }
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    type: "button",
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 4,
      padding: "10px 6px",
      background: "var(--bg-elev)",
      borderRadius: 18,
      border: "1px solid var(--line)",
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent",
      touchAction: "manipulation",
      position: "relative"
    }
  }, statusIcon && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 6,
      right: 6,
      width: 16,
      height: 16,
      borderRadius: "50%",
      background: statusColor,
      color: "#fff",
      fontSize: 10,
      fontWeight: 800,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      lineHeight: 1
    }
  }, statusIcon), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      width: 64,
      height: 64
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "64",
    height: "64",
    style: {
      transform: "rotate(-90deg)"
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "32",
    cy: "32",
    r: r,
    fill: "none",
    stroke: "var(--bg-sunken)",
    strokeWidth: "5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "32",
    cy: "32",
    r: r,
    fill: "none",
    stroke: over ? "var(--danger)" : color,
    strokeWidth: "5",
    strokeLinecap: "round",
    strokeDasharray: c,
    strokeDashoffset: offset,
    style: {
      transition: "stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 18
    }
  }, icon)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--ink-mute)",
      fontWeight: 600,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      marginTop: 2
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: over ? "var(--danger)" : "var(--ink)",
      fontWeight: 700,
      fontVariantNumeric: "tabular-nums",
      lineHeight: 1
    }
  }, Math.round(current), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--ink-mute)",
      fontWeight: 500
    }
  }, "/", target, unit)));
}
const MACRO_TIPS = {
  protein: {
    short: "Te falta proteína. Agrega: 2 huevos (12g), 100g pechuga (30g), 1 lata de atún (25g), o 1 yogurt griego (15g).",
    empty: "Empieza el día con proteína: huevos, yogurt griego o un licuado con proteína en polvo."
  },
  carbs: {
    short: "Te quedas corto en carbos. Agrega: 1 plátano (27g), 1/2 taza de arroz (22g), o 1 rebanada de pan integral (15g).",
    over: "Te pasaste de carbos. Mañana reduce porciones de pan, tortilla, arroz o pasta. Sustituye con verduras o proteína.",
    empty: "Necesitas energía. Una fruta, avena, o 1 tortilla de maíz son buenas opciones."
  },
  fat: {
    short: "Faltan grasas buenas: 1/4 aguacate (7g), 10 almendras (6g), 1 cucharada de aceite de oliva (14g).",
    over: "Te pasaste de grasas. Reduce frituras, mantequilla, quesos, embutidos. Prefiere proteínas magras.",
    empty: "Las grasas saludables son importantes: aguacate, frutos secos, aceite de oliva o pescado."
  },
  fiber: {
    short: "Faltan fibras. Agrega: 1 manzana (4g), 1/2 taza de avena (4g), 1/2 taza de frijoles (8g) o 1/4 taza de chía (10g).",
    empty: "Sin fibra hoy. Avena, frijoles, manzana o chía te ayudan."
  },
  sugar: {
    over: "Te pasaste de azúcar. Esto te puede dar antojos y picos de energía. Mañana evita refrescos, jugos, postres y reduce frutas dulces."
  },
  sodium: {
    over: "Sodio elevado. Hoy tomate más agua. Mañana reduce embutidos, quesos, snacks salados y comida procesada."
  }
};
function getMacroAdvice(key, current, target, isLimit) {
  const pct = target > 0 ? current / target : 0;
  const tips = MACRO_TIPS[key] || {};
  if (current === 0 && !isLimit) return {
    status: "empty",
    title: "Sin registro",
    color: "var(--ink-mute)",
    text: tips.empty || "Aún no has registrado nada de este macro hoy."
  };
  if (isLimit) {
    // sugar, sodium - we want to be UNDER target
    if (pct > 1.1) return {
      status: "over",
      title: "Te pasaste",
      color: "var(--danger)",
      text: tips.over || "Te pasaste del límite recomendado."
    };
    if (pct > 0.85) return {
      status: "close",
      title: "Cerca del límite",
      color: "var(--warn)",
      text: "Estás cerca del límite, cuida lo que comas el resto del día."
    };
    return {
      status: "ok",
      title: "Vas bien",
      color: "var(--mint-deep)",
      text: "Vas dentro del rango saludable. Sigue así."
    };
  } else {
    // protein, carbs, fat, fiber - we want to HIT target
    if (pct > 1.1) return {
      status: "over",
      title: "Te pasaste",
      color: "var(--warn)",
      text: tips.over || "Te pasaste del objetivo. No es grave si es ocasional."
    };
    if (pct >= 0.85) return {
      status: "ok",
      title: "Excelente",
      color: "var(--mint-deep)",
      text: "Llegaste a tu objetivo. Muy bien."
    };
    if (pct >= 0.5) return {
      status: "short",
      title: "Vas a medias",
      color: "var(--warn)",
      text: tips.short || "Te falta para llegar a tu objetivo del día."
    };
    return {
      status: "low",
      title: "Te quedas corto",
      color: "var(--danger)",
      text: tips.short || "Estás muy abajo del objetivo. Es importante completar este macro."
    };
  }
}
function WeightChart({
  history,
  current,
  goal,
  start
}) {
  if (!history || history.length < 2) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "20px 0",
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "var(--ink-mute)",
        fontWeight: 600,
        letterSpacing: 0.5,
        textTransform: "uppercase"
      }
    }, "Sin historial todav\xEDa"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "var(--ink-mute)",
        marginTop: 6,
        lineHeight: 1.5
      }
    }, "Actualiza tu peso varios d\xEDas para ver tu progreso"));
  }
  const points = history.slice(-12).filter(p => p && typeof p.weight === "number" && !isNaN(p.weight));
  if (points.length < 2) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "20px 0",
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "var(--ink-mute)",
        fontWeight: 600,
        letterSpacing: 0.5,
        textTransform: "uppercase"
      }
    }, "Sin historial todav\xEDa"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "var(--ink-mute)",
        marginTop: 6,
        lineHeight: 1.5
      }
    }, "Actualiza tu peso varios d\xEDas para ver tu progreso"));
  }
  const weights = points.map(p => Number(p.weight));
  const safeGoal = Number(goal) || 70;
  const safeStart = Number(start) || Number(current) || 80;
  const safeCurrent = Number(current) || 80;
  const minW = Math.min(...weights, safeGoal) - 1;
  const maxW = Math.max(...weights, safeStart, safeCurrent) + 1;
  const range = maxW - minW || 1;
  const w = 340,
    h = 150,
    padX = 14,
    padTop = 22,
    padBot = 26;
  const chartW = w - padX * 2;
  const chartH = h - padTop - padBot;
  const xStep = points.length > 1 ? chartW / (points.length - 1) : 0;
  const yScale = val => padTop + chartH - (val - minW) / range * chartH;
  const coords = points.map((p, i) => ({
    x: padX + i * xStep,
    y: yScale(p.weight)
  }));
  function smooth(pts) {
    if (pts.length < 2) return "";
    let d = "M" + pts[0].x.toFixed(1) + "," + pts[0].y.toFixed(1);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i],
        p1 = pts[i],
        p2 = pts[i + 1],
        p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6,
        c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6,
        c2y = p2.y - (p3.y - p1.y) / 6;
      d += " C" + c1x.toFixed(1) + "," + c1y.toFixed(1) + " " + c2x.toFixed(1) + "," + c2y.toFixed(1) + " " + p2.x.toFixed(1) + "," + p2.y.toFixed(1);
    }
    return d;
  }
  const linePath = smooth(coords);
  const baseY = padTop + chartH;
  const areaPath = linePath + " L" + coords[coords.length - 1].x.toFixed(1) + "," + baseY + " L" + coords[0].x.toFixed(1) + "," + baseY + " Z";
  const goalY = yScale(safeGoal);
  const first = points[0].weight;
  const last = points[points.length - 1].weight;
  const diff = (last - first).toFixed(1);
  const isLosing = parseFloat(diff) < 0;
  const isGaining = parseFloat(diff) > 0;
  let projection = "";
  if (points.length >= 3 && isLosing) {
    const daysSpan = (new Date(points[points.length - 1].date) - new Date(points[0].date)) / 86400000;
    if (daysSpan > 0) {
      const ratePerDay = Math.abs(parseFloat(diff)) / daysSpan;
      const remaining = current - goal;
      if (ratePerDay > 0 && remaining > 0) {
        const daysToGoal = Math.round(remaining / ratePerDay);
        if (daysToGoal < 2000) {
          projection = daysToGoal < 30 ? "~" + daysToGoal + " días para tu meta" : daysToGoal < 365 ? "~" + Math.round(daysToGoal / 30) + " meses para tu meta" : "~" + (daysToGoal / 365).toFixed(1) + " años para tu meta";
        }
      }
    }
  }
  const lastC = coords[coords.length - 1];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      paddingTop: 14,
      borderTop: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      fontWeight: 700,
      letterSpacing: 1,
      textTransform: "uppercase"
    }
  }, "Tu progreso"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: isLosing ? "var(--mint-deep)" : isGaining ? "var(--warn)" : "var(--ink-mute)"
    }
  }, isLosing ? "↓ " : isGaining ? "↑ " : "", Math.abs(parseFloat(diff)), "kg")), /*#__PURE__*/React.createElement("svg", {
    width: "100%",
    viewBox: "0 0 " + w + " " + h,
    style: {
      display: "block"
    },
    preserveAspectRatio: "xMidYMid meet"
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "wArea",
    x1: "0%",
    y1: "0%",
    x2: "0%",
    y2: "100%"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    style: {
      stopColor: "var(--primary)",
      stopOpacity: 0.22
    }
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    style: {
      stopColor: "var(--primary)",
      stopOpacity: 0
    }
  }))), /*#__PURE__*/React.createElement("rect", {
    x: padX,
    y: goalY,
    width: chartW,
    height: Math.max(0, baseY - goalY),
    style: {
      fill: "var(--mint)"
    },
    opacity: "0.07"
  }), /*#__PURE__*/React.createElement("line", {
    x1: padX,
    y1: goalY,
    x2: w - padX,
    y2: goalY,
    style: {
      stroke: "var(--mint-deep)"
    },
    strokeWidth: "1.5",
    strokeDasharray: "4,4",
    opacity: "0.7"
  }), /*#__PURE__*/React.createElement("text", {
    x: w - padX,
    y: goalY - 5,
    textAnchor: "end",
    fontSize: "10",
    style: {
      fill: "var(--mint-deep)"
    },
    fontWeight: "700"
  }, "Meta ", safeGoal, "kg"), /*#__PURE__*/React.createElement("path", {
    d: areaPath,
    fill: "url(#wArea)"
  }), /*#__PURE__*/React.createElement("path", {
    d: linePath,
    fill: "none",
    style: {
      stroke: "var(--primary)"
    },
    strokeWidth: "2.5",
    strokeLinejoin: "round",
    strokeLinecap: "round"
  }), coords.map((c, i) => /*#__PURE__*/React.createElement("circle", {
    key: i,
    cx: c.x,
    cy: c.y,
    r: "3",
    style: {
      fill: "var(--bg-elev)",
      stroke: "var(--primary)"
    },
    strokeWidth: "2"
  })), /*#__PURE__*/React.createElement("circle", {
    cx: lastC.x,
    cy: lastC.y,
    r: "7",
    style: {
      fill: "var(--primary)"
    },
    opacity: "0.18"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: lastC.x,
    cy: lastC.y,
    r: "4.5",
    style: {
      fill: "var(--primary)",
      stroke: "var(--bg-elev)"
    },
    strokeWidth: "2"
  }), /*#__PURE__*/React.createElement("text", {
    x: lastC.x,
    y: lastC.y - 12,
    textAnchor: points.length > 3 ? "end" : "middle",
    fontSize: "11",
    style: {
      fill: "var(--ink)"
    },
    fontWeight: "800"
  }, last, "kg")), projection && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      padding: "10px 14px",
      background: "var(--mint-soft)",
      borderRadius: 12,
      fontSize: 12,
      color: "var(--mint-deep)",
      fontWeight: 700,
      textAlign: "center"
    }
  }, "\uD83C\uDFAF ", projection));
}
function WeightStat({
  current,
  start,
  goal,
  history
}) {
  const total = start - goal;
  const lost = start - current;
  const pct = Math.min(100, Math.max(0, total > 0 ? lost / total * 100 : 0));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--bg-elev)",
      border: "1px solid var(--line)",
      borderRadius: 24,
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      fontWeight: 600,
      letterSpacing: 1,
      textTransform: "uppercase"
    }
  }, "Peso actual"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 6,
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 48,
      color: "var(--ink)",
      lineHeight: 1,
      fontWeight: 400
    }
  }, current), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--ink-soft)",
      fontWeight: 600
    }
  }, "kg"))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      fontWeight: 600,
      letterSpacing: 1,
      textTransform: "uppercase"
    }
  }, "Meta"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      color: "var(--mint-deep)",
      fontWeight: 800,
      marginTop: 6
    }
  }, goal, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--ink-mute)",
      fontWeight: 500
    }
  }, "kg")))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 8,
      background: "var(--bg-sunken)",
      borderRadius: 6,
      overflow: "hidden",
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: pct + "%",
      background: "linear-gradient(90deg,var(--mint),var(--primary))",
      borderRadius: 6,
      transition: "width 1.2s cubic-bezier(0.16,1,0.3,1)",
      boxShadow: "0 0 12px rgba(8,145,178,0.3)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginTop: 8,
      fontSize: 11,
      color: "var(--ink-mute)",
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement("span", null, "Inicio: ", start, "kg"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--primary)"
    }
  }, pct.toFixed(0), "% completado"), /*#__PURE__*/React.createElement("span", null, "Faltan: ", Math.max(0, (current - goal).toFixed(1)), "kg")), /*#__PURE__*/React.createElement(WeightChart, {
    history: history,
    current: current,
    goal: goal,
    start: start
  }));
}
function Dots() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      padding: "12px 4px",
      alignItems: "center"
    }
  }, [0, 1, 2].map(i => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "dot",
    style: {
      width: 7,
      height: 7,
      borderRadius: "50%",
      background: "var(--primary)",
      animationDelay: i * 0.18 + "s"
    }
  })));
}

// ─── ONBOARDING ──────────────────────────────────────────────────────────────

function Onboarding({
  onSave,
  initial
}) {
  const [step, setStep] = React.useState(0);
  const [data, setData] = React.useState(initial || {
    name: "",
    sex: "",
    age: "",
    height: "",
    weight: "",
    goalWeight: "",
    activity: "light",
    restrictions: "",
    medications: "",
    notes: ""
  });
  const update = (k, v) => setData(d => ({
    ...d,
    [k]: v
  }));
  const finish = () => {
    onSave({
      ...data,
      age: parseInt(data.age) || 30,
      height: parseFloat(data.height) || 170,
      weight: parseFloat(data.weight) || 80,
      goalWeight: parseFloat(data.goalWeight) || 70,
      startWeight: initial ? initial.startWeight : parseFloat(data.weight) || 80
    });
  };
  const inp = {
    width: "100%",
    background: "var(--bg-elev)",
    border: "1.5px solid var(--line)",
    borderRadius: 14,
    padding: "15px 18px",
    color: "var(--ink)",
    fontSize: 16,
    outline: "none",
    marginBottom: 14,
    transition: "all 0.2s",
    fontWeight: 500
  };
  const lbl = {
    fontSize: 11,
    color: "var(--ink-mute)",
    letterSpacing: "1.5px",
    textTransform: "uppercase",
    fontWeight: 700,
    marginBottom: 8,
    display: "block"
  };
  const canNext = () => {
    if (step === 0) return data.name.trim() && data.sex && String(data.age).trim();
    if (step === 1) return String(data.height).trim() && String(data.weight).trim() && String(data.goalWeight).trim();
    if (step === 2) return data.activity;
    return true;
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: "linear-gradient(180deg,#e0f7fa 0%,#fafdfc 60%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 20px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "scale",
    style: {
      width: "100%",
      maxWidth: 440,
      background: "var(--bg-elev)",
      border: "1px solid var(--line)",
      borderRadius: 28,
      padding: 32,
      boxShadow: "0 25px 60px -15px rgba(8,145,178,0.15),0 0 0 1px rgba(8,145,178,0.05)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginBottom: 28
    }
  }, [0, 1, 2, 3].map(i => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      height: 3,
      borderRadius: 3,
      background: i <= step ? "linear-gradient(90deg,var(--primary),var(--mint))" : "var(--line)",
      transition: "all 0.4s"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      letterSpacing: "2.5px",
      fontWeight: 700,
      marginBottom: 6
    }
  }, `PASO ${step + 1} DE 4`), step === 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", {
    className: "serif",
    style: {
      fontSize: 42,
      marginBottom: 6,
      color: "var(--ink)",
      lineHeight: 1
    }
  }, "Hola."), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      color: "var(--ink-soft)",
      marginBottom: 24,
      lineHeight: 1.5
    }
  }, "Vamos a crear tu perfil para darte un plan hecho a tu medida."), /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "Nombre"), /*#__PURE__*/React.createElement("input", {
    style: inp,
    value: data.name,
    onChange: e => update("name", e.target.value),
    placeholder: "Tu nombre"
  }), /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "Sexo biol\xF3gico"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginBottom: 14
    }
  }, [["M", "Hombre"], ["F", "Mujer"]].map(([v, l]) => /*#__PURE__*/React.createElement("button", {
    key: v,
    type: "button",
    onClick: () => {
      console.log("SEX CLICKED", v);
      update("sex", v);
    },
    style: {
      flex: 1,
      padding: "18px 0",
      borderRadius: 14,
      border: data.sex === v ? "3px solid #06b6d4" : "2px solid #cbd5e1",
      cursor: "pointer",
      fontSize: 15,
      fontWeight: 700,
      background: data.sex === v ? "#06b6d4" : "#ffffff",
      color: data.sex === v ? "#fff" : "#334155",
      WebkitTapHighlightColor: "rgba(6,182,212,0.3)",
      touchAction: "manipulation",
      userSelect: "none",
      WebkitUserSelect: "none"
    }
  }, l))), /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "Edad"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    style: inp,
    value: data.age,
    onChange: e => update("age", e.target.value),
    placeholder: "A\xF1os"
  })), step === 1 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", {
    className: "serif",
    style: {
      fontSize: 42,
      marginBottom: 6,
      color: "var(--ink)",
      lineHeight: 1
    }
  }, "Tus medidas."), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      color: "var(--ink-soft)",
      marginBottom: 24,
      lineHeight: 1.5
    }
  }, "Calculamos tu objetivo cal\xF3rico personalizado."), /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "Estatura \xB7 cm"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    style: inp,
    value: data.height,
    onChange: e => update("height", e.target.value),
    placeholder: "170"
  }), /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "Peso actual \xB7 kg"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    style: inp,
    value: data.weight,
    onChange: e => update("weight", e.target.value),
    placeholder: "85"
  }), /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "Peso meta \xB7 kg"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    style: inp,
    value: data.goalWeight,
    onChange: e => update("goalWeight", e.target.value),
    placeholder: "70"
  })), step === 2 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", {
    className: "serif",
    style: {
      fontSize: 42,
      marginBottom: 6,
      color: "var(--ink)",
      lineHeight: 1
    }
  }, "Actividad."), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      color: "var(--ink-soft)",
      marginBottom: 24,
      lineHeight: 1.5
    }
  }, "Cu\xE1nto te mueves en un d\xEDa normal?"), [["sedentary", "Sedentario", "Trabajo de escritorio"], ["light", "Ligero", "Algo de caminata, ejercicio 1-2x"], ["moderate", "Moderado", "Ejercicio 3-5 días por semana"], ["active", "Activo", "Ejercicio diario o trabajo físico"]].map(([v, t, d]) => /*#__PURE__*/React.createElement("button", {
    key: v,
    type: "button",
    onClick: () => {
      console.log("ACT CLICKED", v);
      update("activity", v);
    },
    style: {
      width: "100%",
      textAlign: "left",
      padding: "18px 18px",
      borderRadius: 14,
      border: data.activity === v ? "3px solid #06b6d4" : "2px solid #cbd5e1",
      cursor: "pointer",
      marginBottom: 10,
      background: data.activity === v ? "#e0f7fa" : "#ffffff",
      WebkitTapHighlightColor: "rgba(6,182,212,0.3)",
      touchAction: "manipulation",
      userSelect: "none",
      WebkitUserSelect: "none"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: data.activity === v ? "var(--primary-deep)" : "var(--ink)",
      fontSize: 15,
      fontWeight: 700,
      marginBottom: 2
    }
  }, t), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--ink-mute)",
      fontSize: 13
    }
  }, d)))), step === 3 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", {
    className: "serif",
    style: {
      fontSize: 42,
      marginBottom: 6,
      color: "var(--ink)",
      lineHeight: 1
    }
  }, "Detalles."), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      color: "var(--ink-soft)",
      marginBottom: 24,
      lineHeight: 1.5
    }
  }, "Opcionales pero personalizan mucho mejor tu plan."), /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "Restricciones o preferencias"), /*#__PURE__*/React.createElement("textarea", {
    rows: 2,
    style: {
      ...inp,
      resize: "none",
      lineHeight: 1.5
    },
    value: data.restrictions,
    onChange: e => update("restrictions", e.target.value),
    placeholder: "Ej: vegetariano, no me gusta el pescado..."
  }), /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "Medicamentos"), /*#__PURE__*/React.createElement("input", {
    style: inp,
    value: data.medications,
    onChange: e => update("medications", e.target.value),
    placeholder: "Ej: metformina, Saxenda..."
  }), /*#__PURE__*/React.createElement("label", {
    style: lbl
  }, "Notas o condiciones"), /*#__PURE__*/React.createElement("textarea", {
    rows: 2,
    style: {
      ...inp,
      resize: "none",
      lineHeight: 1.5
    },
    value: data.notes,
    onChange: e => update("notes", e.target.value),
    placeholder: "Ej: diabetes, reflujo, problemas de rodilla..."
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 18
    }
  }, step > 0 && /*#__PURE__*/React.createElement("button", {
    onClick: () => setStep(s => s - 1),
    style: {
      flex: 1,
      padding: 15,
      borderRadius: 14,
      border: "1.5px solid var(--line)",
      cursor: "pointer",
      color: "var(--ink-soft)",
      fontSize: 14,
      fontWeight: 700,
      background: "#ffffff",
      touchAction: "manipulation"
    }
  }, "\u2190 Atr\xE1s"), step < 3 ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      if (canNext()) {
        setStep(s => s + 1);
      } else {
        let msg = "Falta llenar: ";
        const missing = [];
        if (step === 0) {
          if (!data.name.trim()) missing.push("nombre");
          if (!data.sex) missing.push("sexo");
          if (!String(data.age || "").trim()) missing.push("edad");
        }
        if (step === 1) {
          if (!String(data.height || "").trim()) missing.push("estatura");
          if (!String(data.weight || "").trim()) missing.push("peso");
          if (!String(data.goalWeight || "").trim()) missing.push("meta");
        }
        if (step === 2) {
          if (!data.activity) missing.push("nivel de actividad");
        }
        alert(msg + missing.join(", "));
      }
    },
    style: {
      flex: 2,
      padding: 15,
      borderRadius: 14,
      border: "none",
      cursor: "pointer",
      background: "linear-gradient(135deg,var(--primary),var(--mint))",
      color: "#fff",
      fontSize: 15,
      fontWeight: 700,
      boxShadow: "0 8px 20px -8px rgba(8,145,178,0.4)",
      transition: "all 0.2s",
      touchAction: "manipulation",
      WebkitTapHighlightColor: "transparent"
    }
  }, "Continuar") : /*#__PURE__*/React.createElement("button", {
    onClick: finish,
    style: {
      flex: 2,
      padding: 15,
      borderRadius: 14,
      border: "none",
      cursor: "pointer",
      background: "linear-gradient(135deg,var(--mint),var(--primary))",
      color: "#fff",
      fontSize: 15,
      fontWeight: 700,
      boxShadow: "0 8px 20px -8px rgba(16,185,129,0.4)",
      touchAction: "manipulation",
      WebkitTapHighlightColor: "transparent"
    }
  }, "Empezar"))));
}

// ─── FOOD LOG MODAL ──────────────────────────────────────────────────────────

function FoodLogModal({
  onSave,
  onClose,
  apiKey,
  askKey
}) {
  const [text, setText] = React.useState("");
  const [meal, setMeal] = React.useState("almuerzo");
  const [loading, setLoading] = React.useState(false);
  const [parsed, setParsed] = React.useState(null);
  const [error, setError] = React.useState("");
  const [photos, setPhotos] = React.useState([]);
  const [inputMode, setInputMode] = React.useState("text");
  const cameraRef = React.useRef(null);
  const galleryRef = React.useRef(null);
  const handlePhoto = async e => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (photos.length + files.length > 8) {
      setError("Máximo 8 fotos por comida");
      return;
    }
    try {
      const newPhotos = [];
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
          setError("Una foto pasa los 10MB");
          continue;
        }
        const result = await fileToBase64(file);
        newPhotos.push({
          ...result,
          preview: URL.createObjectURL(file),
          id: Math.random().toString(36).slice(2, 8)
        });
      }
      setPhotos(prev => [...prev, ...newPhotos]);
      setError("");
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    } catch (err) {
      setError("Error cargando fotos");
    }
  };
  const removePhoto = id => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };
  const clearPhotos = () => {
    setPhotos([]);
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  };
  const analyze = async () => {
    if (inputMode === "text" && !text.trim()) return;
    if (inputMode === "photo" && photos.length === 0) return;
    if (!apiKey) {
      askKey();
      return;
    }
    setLoading(true);
    setError("");
    let resp = "";
    try {
      if (inputMode === "photo") {
        const multiContext = photos.length > 1 ? "Estás viendo " + photos.length + " fotos relacionadas a UNA SOLA comida (ej: el alimento, su empaque, la información nutrimental, ingredientes). Combina toda la información visible para hacer un análisis preciso. " : "";
        const photoPrompt = multiContext + "Analiza la(s) foto(s). Identifica TODOS los alimentos, lee etiquetas nutrimentales si las hay, estima porciones realistas y calcula valores nutricionales precisos. " + (text.trim() ? "Contexto adicional del usuario: " + text : "");
        if (photos.length === 1) {
          resp = await apiVision(apiKey, FOOD_LOG_PROMPT, photoPrompt + " (Comida de " + meal + ")", photos[0].base64, photos[0].mediaType, 2500);
        } else {
          resp = await apiVisionMulti(apiKey, FOOD_LOG_PROMPT, photoPrompt + " (Comida de " + meal + ")", photos, 2500);
        }
      } else {
        resp = await api(apiKey, FOOD_LOG_PROMPT, [{
          role: "user",
          content: "Analiza (" + meal + "): " + text
        }], 1500);
      }
      // Robust JSON extraction - find the first { and last }
      let jsonStr = resp.replace(/```json|```/g, "").trim();
      const firstBrace = jsonStr.indexOf("{");
      const lastBrace = jsonStr.lastIndexOf("}");
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }
      const json = JSON.parse(jsonStr);
      setParsed({
        ...json,
        meal,
        originalText: inputMode === "photo" ? text.trim() || (photos.length > 1 ? photos.length + " fotos" : "Foto del plato") : text,
        hasPhoto: inputMode === "photo",
        photoCount: photos.length
      });
    } catch (e) {
      console.error("Food analyze error:", e, "Response:", resp);
      setError("No pude analizar. Detalle: " + e.message.slice(0, 100) + ". Intenta de nuevo.");
    }
    setLoading(false);
  };
  const save = () => {
    if (!parsed) return;
    onSave({
      ...parsed,
      timestamp: Date.now(),
      id: Math.random().toString(36).slice(2, 10)
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "fadeIn",
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(10,31,28,0.4)",
      backdropFilter: "blur(8px)",
      zIndex: 300,
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "fade",
    style: {
      width: "100%",
      maxWidth: 560,
      background: "var(--bg-elev)",
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      padding: 24,
      maxHeight: "92vh",
      overflowY: "auto",
      boxShadow: "0 -10px 40px -10px rgba(0,0,0,0.15)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 42,
      height: 5,
      background: "var(--line-strong)",
      borderRadius: 4,
      margin: "0 auto 22px"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 28,
      color: "var(--ink)",
      lineHeight: 1
    }
  }, "Nueva comida"), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      background: "var(--bg-sunken)",
      border: "none",
      borderRadius: "50%",
      width: 36,
      height: 36,
      color: "var(--ink-soft)",
      fontSize: 20,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      letterSpacing: 1.5,
      textTransform: "uppercase",
      fontWeight: 700,
      marginBottom: 10,
      display: "block"
    }
  }, "Tipo"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 8,
      marginBottom: 20
    }
  }, ["desayuno", "almuerzo", "cena", "snack"].map(m => /*#__PURE__*/React.createElement("button", {
    key: m,
    onClick: () => setMeal(m),
    style: {
      padding: "14px 0",
      borderRadius: 14,
      border: meal === m ? "none" : "1.5px solid var(--line)",
      cursor: "pointer",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      background: meal === m ? "linear-gradient(135deg,var(--primary),var(--mint))" : "var(--bg-elev)",
      color: meal === m ? "#fff" : "var(--ink-mute)",
      transition: "all 0.2s"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      marginBottom: 4
    }
  }, MEAL_ICONS[m]), m))), !parsed && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginBottom: 16,
      padding: 4,
      background: "var(--bg-sunken)",
      borderRadius: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      setInputMode("photo");
    },
    style: {
      flex: 1,
      padding: "10px 0",
      borderRadius: 9,
      border: "none",
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 700,
      background: inputMode === "photo" ? "var(--bg-elev)" : "transparent",
      color: inputMode === "photo" ? "var(--ink)" : "var(--ink-mute)",
      transition: "all 0.2s",
      boxShadow: inputMode === "photo" ? "0 2px 6px rgba(0,0,0,0.05)" : "none",
      WebkitTapHighlightColor: "transparent"
    }
  }, "\uD83D\uDCF7 Foto"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      setInputMode("text");
      clearPhoto();
    },
    style: {
      flex: 1,
      padding: "10px 0",
      borderRadius: 9,
      border: "none",
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 700,
      background: inputMode === "text" ? "var(--bg-elev)" : "transparent",
      color: inputMode === "text" ? "var(--ink)" : "var(--ink-mute)",
      transition: "all 0.2s",
      boxShadow: inputMode === "text" ? "0 2px 6px rgba(0,0,0,0.05)" : "none",
      WebkitTapHighlightColor: "transparent"
    }
  }, "\u270D\uFE0F Escribir")), inputMode === "photo" && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 16
    }
  }, photos.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => cameraRef.current && cameraRef.current.click(),
    style: {
      padding: "28px 12px",
      borderRadius: 16,
      border: "2px dashed var(--line-strong)",
      background: "var(--bg-sunken)",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10,
      WebkitTapHighlightColor: "transparent",
      touchAction: "manipulation"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 48,
      height: 48,
      borderRadius: 14,
      background: "linear-gradient(135deg,var(--primary),var(--primary-deep))",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 24,
      color: "#fff"
    }
  }, "\uD83D\uDCF8"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--ink)",
      fontWeight: 700
    }
  }, "Tomar foto"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      textAlign: "center",
      lineHeight: 1.4
    }
  }, "Una o varias")), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => galleryRef.current && galleryRef.current.click(),
    style: {
      padding: "28px 12px",
      borderRadius: 16,
      border: "2px dashed var(--line-strong)",
      background: "var(--bg-sunken)",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10,
      WebkitTapHighlightColor: "transparent",
      touchAction: "manipulation"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 48,
      height: 48,
      borderRadius: 14,
      background: "linear-gradient(135deg,var(--mint),var(--mint-deep))",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 24,
      color: "#fff"
    }
  }, "\uD83D\uDDBC\uFE0F"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--ink)",
      fontWeight: 700
    }
  }, "Galer\xEDa"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      textAlign: "center",
      lineHeight: 1.4
    }
  }, "Selecciona varias")), /*#__PURE__*/React.createElement("input", {
    ref: cameraRef,
    type: "file",
    accept: "image/*",
    capture: "environment",
    multiple: true,
    onChange: handlePhoto,
    style: {
      display: "none"
    }
  }), /*#__PURE__*/React.createElement("input", {
    ref: galleryRef,
    type: "file",
    accept: "image/*",
    multiple: true,
    onChange: handlePhoto,
    style: {
      display: "none"
    }
  })) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,1fr)",
      gap: 8,
      marginBottom: 10
    }
  }, photos.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: p.id,
    style: {
      position: "relative",
      aspectRatio: "1",
      borderRadius: 12,
      overflow: "hidden",
      border: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: p.preview,
    alt: "Foto " + (i + 1),
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => removePhoto(p.id),
    style: {
      position: "absolute",
      top: 4,
      right: 4,
      background: "rgba(0,0,0,0.7)",
      border: "none",
      borderRadius: "50%",
      width: 24,
      height: 24,
      color: "#fff",
      fontSize: 14,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      WebkitTapHighlightColor: "transparent",
      lineHeight: 1
    }
  }, "\xD7"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      bottom: 4,
      left: 4,
      background: "rgba(0,0,0,0.7)",
      borderRadius: 6,
      padding: "2px 6px",
      fontSize: 10,
      color: "#fff",
      fontWeight: 700
    }
  }, i + 1))), photos.length < 8 && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => galleryRef.current && galleryRef.current.click(),
    style: {
      aspectRatio: "1",
      borderRadius: 12,
      border: "2px dashed var(--line-strong)",
      background: "var(--bg-sunken)",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      color: "var(--ink-mute)",
      fontSize: 24,
      fontWeight: 300,
      WebkitTapHighlightColor: "transparent"
    }
  }, /*#__PURE__*/React.createElement("div", null, "+"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 700
    }
  }, "Agregar"))), /*#__PURE__*/React.createElement("input", {
    ref: cameraRef,
    type: "file",
    accept: "image/*",
    capture: "environment",
    multiple: true,
    onChange: handlePhoto,
    style: {
      display: "none"
    }
  }), /*#__PURE__*/React.createElement("input", {
    ref: galleryRef,
    type: "file",
    accept: "image/*",
    multiple: true,
    onChange: handlePhoto,
    style: {
      display: "none"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => cameraRef.current && cameraRef.current.click(),
    disabled: photos.length >= 8,
    style: {
      flex: 1,
      padding: "10px",
      borderRadius: 10,
      border: "1px solid var(--line)",
      background: "var(--bg-elev)",
      cursor: photos.length >= 8 ? "not-allowed" : "pointer",
      fontSize: 12,
      fontWeight: 700,
      color: "var(--primary)",
      WebkitTapHighlightColor: "transparent"
    }
  }, "\uD83D\uDCF8 C\xE1mara"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: clearPhotos,
    style: {
      flex: 1,
      padding: "10px",
      borderRadius: 10,
      border: "1px solid var(--line)",
      background: "var(--bg-elev)",
      cursor: "pointer",
      fontSize: 12,
      fontWeight: 700,
      color: "var(--ink-mute)",
      WebkitTapHighlightColor: "transparent"
    }
  }, "Limpiar todo")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      textAlign: "center",
      marginBottom: 8,
      fontWeight: 500
    }
  }, photos.length, " ", photos.length === 1 ? "foto" : "fotos", " \xB7 Tip: agrega etiqueta nutrimental para m\xE1s precisi\xF3n")), /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      letterSpacing: 1.5,
      textTransform: "uppercase",
      fontWeight: 700,
      marginTop: 14,
      marginBottom: 8,
      display: "block"
    }
  }, "Nota opcional"), /*#__PURE__*/React.createElement("textarea", {
    rows: 2,
    value: text,
    onChange: e => setText(e.target.value),
    placeholder: "Ej: '250ml de leche', '1 scoop de prote\xEDna', 'porci\xF3n grande'...",
    style: {
      width: "100%",
      background: "var(--bg-elev)",
      border: "1.5px solid var(--line)",
      borderRadius: 14,
      padding: "12px 14px",
      color: "var(--ink)",
      fontSize: 14,
      resize: "none",
      outline: "none",
      lineHeight: 1.5,
      fontFamily: "inherit"
    }
  })), inputMode === "text" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      letterSpacing: 1.5,
      textTransform: "uppercase",
      fontWeight: 700,
      marginBottom: 10,
      display: "block"
    }
  }, "Qu\xE9 comiste? Incluye porciones"), /*#__PURE__*/React.createElement("textarea", {
    rows: 4,
    value: text,
    onChange: e => setText(e.target.value),
    placeholder: "Ej: 2 huevos revueltos con jam\xF3n, 1 rebanada de pan tostado con mantequilla, 1 caf\xE9 con leche...",
    style: {
      width: "100%",
      background: "var(--bg-elev)",
      border: "1.5px solid var(--line)",
      borderRadius: 16,
      padding: "15px 17px",
      color: "var(--ink)",
      fontSize: 15,
      resize: "none",
      outline: "none",
      lineHeight: 1.6,
      marginBottom: 16,
      fontFamily: "inherit",
      transition: "all 0.2s"
    }
  })), /*#__PURE__*/React.createElement("button", {
    onClick: analyze,
    disabled: (inputMode === "text" ? !text.trim() : photos.length === 0) || loading,
    style: {
      width: "100%",
      padding: 16,
      background: (inputMode === "text" ? !text.trim() : photos.length === 0) || loading ? "var(--bg-sunken)" : "linear-gradient(135deg,var(--mint),var(--primary))",
      border: "none",
      borderRadius: 16,
      color: (inputMode === "text" ? !text.trim() : photos.length === 0) || loading ? "var(--ink-mute)" : "#fff",
      fontSize: 15,
      fontWeight: 700,
      cursor: (inputMode === "text" ? !text.trim() : photos.length === 0) || loading ? "not-allowed" : "pointer",
      letterSpacing: 0.3,
      boxShadow: (inputMode === "text" ? !text.trim() : photos.length === 0) || loading ? "none" : "0 8px 24px -8px rgba(16,185,129,0.5)"
    }
  }, loading ? inputMode === "photo" ? "Analizando " + photos.length + (photos.length === 1 ? " foto…" : " fotos…") : "Analizando…" : "Analizar")), error && /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--danger)",
      fontSize: 13,
      marginTop: 10,
      textAlign: "center",
      padding: 12,
      background: "rgba(239,68,68,0.08)",
      borderRadius: 12,
      border: "1px solid rgba(239,68,68,0.2)"
    }
  }, error), parsed && /*#__PURE__*/React.createElement("div", {
    className: "fade",
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "linear-gradient(135deg,rgba(16,185,129,0.06),rgba(8,145,178,0.04))",
      border: "1px solid var(--mint-soft)",
      borderRadius: 20,
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--mint-deep)",
      letterSpacing: 1.5,
      fontWeight: 700,
      marginBottom: 14,
      textTransform: "uppercase"
    }
  }, "\u2713 An\xE1lisis ", parsed.hasPhoto ? "de foto" : ""), parsed.items && parsed.items.map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      padding: "12px 0",
      borderBottom: i < parsed.items.length - 1 ? "1px solid var(--line)" : "none",
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 12,
      background: "var(--bg-sunken)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 22,
      flexShrink: 0
    }
  }, getFoodEmoji(it.name)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--ink)",
      marginBottom: 3,
      fontWeight: 600
    }
  }, it.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--ink-mute)"
    }
  }, it.portion, " \xB7 ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "var(--primary)"
    }
  }, it.kcal, "kcal"), " \xB7 P:", it.protein, "g \xB7 C:", it.carbs, "g \xB7 G:", it.fat, "g")))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      padding: "16px 18px",
      background: "var(--bg-elev)",
      borderRadius: 14,
      border: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      letterSpacing: 1.5,
      fontWeight: 700,
      marginBottom: 12,
      textTransform: "uppercase"
    }
  }, "Total"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      fontWeight: 600
    }
  }, "Calor\xEDas"), /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 32,
      color: "var(--primary)",
      lineHeight: 1,
      marginTop: 2
    }
  }, parsed.totals.kcal)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      fontWeight: 600
    }
  }, "Prote\xEDna"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      marginTop: 6
    }
  }, parsed.totals.protein, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)"
    }
  }, "g"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      fontWeight: 600
    }
  }, "Carbos"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      marginTop: 6
    }
  }, parsed.totals.carbs, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)"
    }
  }, "g"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      fontWeight: 600
    }
  }, "Grasas"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      marginTop: 6
    }
  }, parsed.totals.fat, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)"
    }
  }, "g"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      fontWeight: 600
    }
  }, "Az\xFAcar"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      marginTop: 6
    }
  }, parsed.totals.sugar, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)"
    }
  }, "g"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      fontWeight: 600
    }
  }, "Fibra"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      marginTop: 6
    }
  }, parsed.totals.fiber, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)"
    }
  }, "g"))))), parsed.summary && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      fontSize: 13,
      color: "var(--ink-soft)",
      fontStyle: "italic",
      lineHeight: 1.5,
      padding: "12px 0 0"
    }
  }, "\"", parsed.summary, "\"")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setParsed(null);
    },
    style: {
      flex: 1,
      padding: 14,
      background: "var(--bg-elev)",
      border: "1.5px solid var(--line)",
      borderRadius: 14,
      color: "var(--ink-soft)",
      fontSize: 13,
      cursor: "pointer",
      fontWeight: 700
    }
  }, "Editar"), /*#__PURE__*/React.createElement("button", {
    onClick: save,
    style: {
      flex: 2,
      padding: 14,
      background: "linear-gradient(135deg,var(--mint),var(--primary))",
      border: "none",
      borderRadius: 14,
      color: "#fff",
      fontSize: 14,
      cursor: "pointer",
      fontWeight: 700,
      boxShadow: "0 6px 16px -4px rgba(16,185,129,0.4)"
    }
  }, "Guardar")))));
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────

function App() {
  const [profile, setProfile] = React.useState(() => safeGetLSJSON("mc_profile", null));
  const [weightHistory, setWeightHistory] = React.useState(() => safeGetLSJSON("mc_weight_history", []));
  const [showProfile, setShowProfile] = React.useState(false);
  const [tab, setTab] = React.useState("today");
  const [selectedDate, setSelectedDate] = React.useState(todayKey());
  const [editKg, setEditKg] = React.useState(false);
  const [tmpKg, setTmpKg] = React.useState("");
  const [key, setKey] = React.useState(() => safeGetLS("mc_key", ""));
  const [showKey, setShowKey] = React.useState(false);
  const [foodLog, setFoodLog] = React.useState(() => safeGetLSJSON("mc_log", {}));
  const [showFoodModal, setShowFoodModal] = React.useState(false);
  const [planData, setPlanData] = React.useState(() => safeGetLSJSON("mc_plans", {}));
  const [planCtx, setPlanCtx] = React.useState("");
  const [planMenu, setPlanMenu] = React.useState("");
  const [planMode, setPlanMode] = React.useState("n");
  const [menuInputMode, setMenuInputMode] = React.useState("text");
  const [menuPhoto, setMenuPhoto] = React.useState(null);
  const [menuPhotoPreview, setMenuPhotoPreview] = React.useState("");
  const [analyzingPhoto, setAnalyzingPhoto] = React.useState(false);
  const photoInputRef = React.useRef(null);
  const cameraInputRef = React.useRef(null);
  const [exCtx, setExCtx] = React.useState("");
  const [macroDetail, setMacroDetail] = React.useState(null);
  const [showRecipe, setShowRecipe] = React.useState(null);
  const [foodDetail, setFoodDetail] = React.useState(null);
  const [foodAnalysis, setFoodAnalysis] = React.useState({});
  const [analyzingFood, setAnalyzingFood] = React.useState(false);
  const [entryDetail, setEntryDetail] = React.useState(null);
  const [entryAnalysis, setEntryAnalysis] = React.useState(null);
  const [analyzingEntry, setAnalyzingEntry] = React.useState(false);
  const [editingEntry, setEditingEntry] = React.useState(null);
  const [editingItems, setEditingItems] = React.useState([]);
  const [editingMeal, setEditingMeal] = React.useState("");
  const [editingText, setEditingText] = React.useState("");
  const [reanalyzing, setReanalyzing] = React.useState(false);
  // Unregister any existing service workers (cleanup from previous version)
  React.useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => reg.unregister());
      }).catch(() => {});
    }
  }, []);
  const [recipeCategory, setRecipeCategory] = React.useState("desayuno");
  const [dailyMenu, setDailyMenu] = React.useState(() => safeGetLSJSON("mc_daily_menu", null));
  const [generatingMenu, setGeneratingMenu] = React.useState(false);
  const [waterLog, setWaterLog] = React.useState(() => safeGetLSJSON("mc_water_log", {}));
  const [weeklyReport, setWeeklyReport] = React.useState(() => safeGetLSJSON("mc_weekly_report", null));
  const [generatingReport, setGeneratingReport] = React.useState(false);
  const [showReport, setShowReport] = React.useState(false);
  const [coachMemory, setCoachMemory] = React.useState(() => safeGetLSJSON("mc_coach_memory", []));
  const [chat, setChat] = React.useState([{
    r: "a",
    t: profile ? `Hola ${profile.name || ""}. Soy tu coach. Pregúntame lo que quieras sobre tu alimentación, ejercicio o plan. Puedes adjuntar fotos o PDFs.` : "Hola."
  }]);
  const [cin, setCin] = React.useState("");
  const [cL, setCL] = React.useState(false);
  const [chatAttachments, setChatAttachments] = React.useState([]);
  const [showAttachMenu, setShowAttachMenu] = React.useState(false);
  const cEnd = React.useRef(null);
  const chatPhotoRef = React.useRef(null);
  const chatCameraRef = React.useRef(null);
  const chatFileRef = React.useRef(null);
  const chatAnyFileRef = React.useRef(null);
  React.useEffect(() => {
    if (profile) localStorage.setItem("mc_profile", JSON.stringify(profile));
  }, [profile]);
  React.useEffect(() => {
    localStorage.setItem("mc_weight_history", JSON.stringify(weightHistory));
  }, [weightHistory]);
  React.useEffect(() => {
    localStorage.setItem("mc_coach_memory", JSON.stringify(coachMemory));
  }, [coachMemory]);
  React.useEffect(() => {
    if (weeklyReport) localStorage.setItem("mc_weekly_report", JSON.stringify(weeklyReport));
  }, [weeklyReport]);
  React.useEffect(() => {
    localStorage.setItem("mc_water_log", JSON.stringify(waterLog));
  }, [waterLog]);
  React.useEffect(() => {
    if (dailyMenu) localStorage.setItem("mc_daily_menu", JSON.stringify(dailyMenu));
  }, [dailyMenu]);
  React.useEffect(() => {
    localStorage.setItem("mc_log", JSON.stringify(foodLog));
  }, [foodLog]);
  React.useEffect(() => {
    localStorage.setItem("mc_plans", JSON.stringify(planData));
  }, [planData]);
  React.useEffect(() => {
    if (tab === "chat") setTimeout(() => cEnd.current && cEnd.current.scrollIntoView({
      behavior: "smooth"
    }), 80);
  }, [chat, tab]);

  // Smart greeting based on memory (only first render) - MUST be BEFORE any conditional return
  React.useEffect(() => {
    if (profile && chat.length === 1 && coachMemory.length > 0) {
      const lastMem = coachMemory[coachMemory.length - 1];
      const daysAgo = Math.round((Date.now() - lastMem.timestamp) / 86400000);
      const timeStr = daysAgo === 0 ? "hoy" : daysAgo === 1 ? "ayer" : "hace " + daysAgo + " días";
      setChat([{
        r: "a",
        t: `Hola ${profile.name}, qué bueno verte. La última vez que platicamos (${timeStr}) hablamos de algunas cosas. ¿Cómo vas con eso? ¿En qué te ayudo hoy?`
      }]);
    }
    // eslint-disable-next-line
  }, []);
  if (!profile) return /*#__PURE__*/React.createElement(Onboarding, {
    onSave: p => {
      setProfile(p);
      setWeightHistory([{
        date: todayKey(),
        weight: p.weight
      }]);
      setChat([{
        r: "a",
        t: `Hola ${p.name}. Soy tu coach personal. Pregúntame lo que quieras.`
      }]);
    }
  });
  if (showProfile) return /*#__PURE__*/React.createElement(Onboarding, {
    initial: profile,
    onSave: p => {
      setProfile(p);
      setShowProfile(false);
    }
  });
  const profData = buildProfile(profile);
  const macroTargets = getMacroTargets(profData.target, profile.weight);
  const todayEntries = foodLog[selectedDate] || [];
  const todayTotals = sumDay(todayEntries);
  const remaining = profData.target - todayTotals.kcal;
  const saveKey = k => {
    setKey(k);
    localStorage.setItem("mc_key", k);
  };
  const saveFoodEntry = entry => {
    setFoodLog(prev => ({
      ...prev,
      [selectedDate]: [...(prev[selectedDate] || []), entry]
    }));
    setShowFoodModal(false);
  };
  const deleteFoodEntry = id => {
    setFoodLog(prev => ({
      ...prev,
      [selectedDate]: (prev[selectedDate] || []).filter(e => e.id !== id)
    }));
  };
  const updateFoodEntry = (id, updates, dateKey) => {
    const dKey = dateKey || selectedDate;
    setFoodLog(prev => {
      const dayEntries = prev[dKey] || [];
      const updated = dayEntries.map(e => {
        if (e.id !== id) return e;
        const merged = {
          ...e,
          ...updates
        };
        // Recalculate totals from items if items provided
        if (updates.items) {
          merged.totals = updates.items.reduce((acc, it) => ({
            kcal: acc.kcal + (Number(it.kcal) || 0),
            protein: acc.protein + (Number(it.protein) || 0),
            carbs: acc.carbs + (Number(it.carbs) || 0),
            fat: acc.fat + (Number(it.fat) || 0),
            sugar: acc.sugar + (Number(it.sugar) || 0),
            fiber: acc.fiber + (Number(it.fiber) || 0),
            sodium: acc.sodium + (Number(it.sodium) || 0)
          }), {
            kcal: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            sugar: 0,
            fiber: 0,
            sodium: 0
          });
        }
        return merged;
      });
      return {
        ...prev,
        [dKey]: updated
      };
    });
  };
  const updateWeight = w => {
    setProfile(p => ({
      ...p,
      weight: w
    }));
    const today = todayKey();
    setWeightHistory(prev => {
      const filtered = prev.filter(e => e.date !== today);
      return [...filtered, {
        date: today,
        weight: w
      }].sort((a, b) => new Date(a.date) - new Date(b.date));
    });
  };
  const allDates = Array.from({
    length: 30
  }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return dateKey(d);
  });
  const getAlerts = () => {
    const a = [];
    if (todayTotals.kcal > profData.target * 1.1) a.push({
      type: "high",
      text: `Te pasaste ${Math.round(todayTotals.kcal - profData.target)}kcal del límite diario`
    });
    if (todayTotals.sugar > macroTargets.sugar) a.push({
      type: "high",
      text: `Azúcar elevada: ${Math.round(todayTotals.sugar)}g (límite ${macroTargets.sugar}g)`
    });
    if (todayTotals.fat > macroTargets.fat * 1.2) a.push({
      type: "high",
      text: `Grasas elevadas: ${Math.round(todayTotals.fat)}g hoy`
    });
    if (todayTotals.sodium > 2300) a.push({
      type: "warn",
      text: `Sodio alto: ${Math.round(todayTotals.sodium)}mg (límite 2300mg)`
    });
    if (todayEntries.length > 0 && todayTotals.protein < macroTargets.protein * 0.7) a.push({
      type: "warn",
      text: `Proteína baja: ${Math.round(todayTotals.protein)}g de ${macroTargets.protein}g`
    });
    return a;
  };
  const alerts = getAlerts();
  const askMeal = async () => {
    if (!planCtx.trim()) return;
    if (!key) {
      setShowKey(true);
      return;
    }
    setPlanData(p => ({
      ...p,
      [selectedDate]: {
        ...p[selectedDate],
        ml: true,
        ctx: planCtx,
        menu: planMenu,
        mm: planMode
      }
    }));
    let menuText = planMenu;
    if (planMode === "r" && menuPhoto) {
      try {
        setAnalyzingPhoto(true);
        const visionPrompt = "Lee esta carta de restaurante (puede ser foto del menú o de un código QR escaneado). Lista TODOS los platillos visibles con su precio si lo ves. Si es un QR code, dime que necesito tomar foto del menú directamente, no del QR.";
        const photoAnalysis = await apiVision(key, "Eres experto leyendo cartas de restaurantes. Devuelve solo la lista de platillos.", visionPrompt, menuPhoto.base64, menuPhoto.mediaType);
        menuText = photoAnalysis;
        setAnalyzingPhoto(false);
      } catch (e) {
        setAnalyzingPhoto(false);
        setPlanData(p => ({
          ...p,
          [selectedDate]: {
            ...p[selectedDate],
            ml: false,
            mr: "Error analizando foto: " + e.message
          }
        }));
        return;
      }
    }
    const ex = planMode === "r" && menuText.trim() ? "\nCARTA:\n" + menuText : "";
    try {
      const t = await api(key, MEAL_PROMPT(profData.profile), [{
        role: "user",
        content: "Donde estoy: " + planCtx + ex
      }]);
      setPlanData(p => ({
        ...p,
        [selectedDate]: {
          ...p[selectedDate],
          ml: false,
          mr: t,
          ctx: planCtx,
          menu: menuText,
          mm: planMode
        }
      }));
    } catch (e) {
      setPlanData(p => ({
        ...p,
        [selectedDate]: {
          ...p[selectedDate],
          ml: false,
          mr: "Error: " + e.message
        }
      }));
    }
  };
  const handlePhotoSelect = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const result = await fileToBase64(file);
      setMenuPhoto(result);
      setMenuPhotoPreview(URL.createObjectURL(file));
    } catch (err) {
      alert("Error cargando foto");
    }
  };
  const clearPhoto = () => {
    setMenuPhoto(null);
    setMenuPhotoPreview("");
    if (photoInputRef.current) photoInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };
  const askEx = async () => {
    if (!key) {
      setShowKey(true);
      return;
    }
    setPlanData(p => ({
      ...p,
      [selectedDate]: {
        ...p[selectedDate],
        el: true
      }
    }));
    const mi = todayEntries.length > 0 ? "Comió hoy:\n" + todayEntries.map(e => `${e.meal}: ${e.originalText} (${e.totals.kcal}kcal)`).join("\n") + `\nTOTAL: ${Math.round(todayTotals.kcal)}kcal` : "Sin registro de comida.";
    const ext = exCtx.trim() ? "\nContexto: " + exCtx : "";
    try {
      const t = await api(key, EXERCISE_PROMPT(profData.profile), [{
        role: "user",
        content: mi + ext
      }]);
      setPlanData(p => ({
        ...p,
        [selectedDate]: {
          ...p[selectedDate],
          el: false,
          er: t
        }
      }));
    } catch (e) {
      setPlanData(p => ({
        ...p,
        [selectedDate]: {
          ...p[selectedDate],
          el: false,
          er: "Error: " + e.message
        }
      }));
    }
  };
  const sendChat = async () => {
    if (!cin.trim() && chatAttachments.length === 0 || cL) return;
    if (!key) {
      setShowKey(true);
      return;
    }

    // Build display label for user message (number of attachments)
    let attDisplay = "";
    if (chatAttachments.length > 0) {
      const imgCount = chatAttachments.filter(a => a.mediaType.startsWith("image/")).length;
      const otherCount = chatAttachments.length - imgCount;
      const parts = [];
      if (imgCount > 0) parts.push(imgCount + (imgCount === 1 ? " foto" : " fotos"));
      if (otherCount > 0) parts.push(otherCount + (otherCount === 1 ? " archivo" : " archivos"));
      attDisplay = parts.join(" + ");
    }

    // Use first image preview as the "att" thumbnail for the message bubble
    const firstImg = chatAttachments.find(a => a.mediaType.startsWith("image/"));
    const attThumb = firstImg ? firstImg.preview : chatAttachments[0]?.fileName || "";
    const userMsg = {
      r: "u",
      t: cin || "(enviado: " + attDisplay + ")",
      att: attThumb,
      attType: firstImg ? firstImg.mediaType : chatAttachments[0]?.mediaType || null,
      attCount: chatAttachments.length
    };
    const nc = [...chat, userMsg];
    setChat(nc);
    setCin("");
    setCL(true);
    const currentAtts = [...chatAttachments];
    setChatAttachments([]);
    if (chatPhotoRef.current) chatPhotoRef.current.value = "";
    if (chatCameraRef.current) chatCameraRef.current.value = "";
    if (chatFileRef.current) chatFileRef.current.value = "";

    // Build full food context for coach
    const waterToday = waterLog[todayKey()] || 0;
    const waterGoalCtx = Math.round((profile.weight || 80) * 0.035 * 10) / 10;
    let foodCtx = "";
    if (todayEntries.length > 0) {
      const byMeal = {};
      todayEntries.forEach(e => {
        if (!byMeal[e.meal]) byMeal[e.meal] = [];
        const items = e.items ? e.items.map(i => `${i.name} (${i.portion}, ${i.kcal}kcal)`).join(", ") : e.originalText;
        byMeal[e.meal].push(items);
      });
      const mealLines = Object.entries(byMeal).map(([meal, items]) => `  ${meal}: ${items.join(" + ")}`).join("\n");
      foodCtx = `\n\nCOMIDA DE HOY (${todayKey()}):
${mealLines}
TOTALES HOY: ${Math.round(todayTotals.kcal)}kcal de ${profData.target} objetivo | Proteína: ${Math.round(todayTotals.protein)}g/${macroTargets.protein}g | Carbos: ${Math.round(todayTotals.carbs)}g | Grasas: ${Math.round(todayTotals.fat)}g | Azúcar: ${Math.round(todayTotals.sugar)}g (límite ${macroTargets.sugar}g) | Fibra: ${Math.round(todayTotals.fiber)}g | Sodio: ${Math.round(todayTotals.sodium)}mg
AGUA HOY: ${waterToday}ml de ${waterGoalCtx * 1000}ml objetivo`;
    } else {
      foodCtx = `\n\nCOMIDA DE HOY: Sin registro todavía.\nAGUA HOY: ${waterToday}ml de ${waterGoalCtx * 1000}ml objetivo`;
    }

    // Last 3 days for pattern awareness
    let recentFoodCtx = "";
    for (let d = 1; d <= 3; d++) {
      const past = new Date();
      past.setDate(past.getDate() - d);
      const k = dateKey(past);
      const entries = foodLog[k] || [];
      if (entries.length > 0) {
        const t = sumDay(entries);
        const dayName = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][past.getDay()];
        recentFoodCtx += `\n  ${dayName} ${k}: ${Math.round(t.kcal)}kcal, P:${Math.round(t.protein)}g, C:${Math.round(t.carbs)}g, G:${Math.round(t.fat)}g`;
      }
    }
    if (recentFoodCtx) foodCtx += `\nÚLTIMOS 3 DÍAS:${recentFoodCtx}`;

    // Weight history
    if (weightHistory.length > 0) {
      const last3w = weightHistory.slice(-3).map(w => `${w.date}: ${w.weight}kg`).join(", ");
      foodCtx += `\nPESO RECIENTE: ${last3w}`;
    }
    const ctx2 = foodCtx;

    // Include memory summary in system prompt
    let memoryContext = "";
    if (coachMemory.length > 0) {
      const recentMem = coachMemory.slice(-5);
      memoryContext = "\n\nMEMORIA DE CONVERSACIONES PASADAS (usa esto para personalizar):\n" + recentMem.map(m => {
        const daysAgo = Math.round((Date.now() - m.timestamp) / 86400000);
        return "- (" + daysAgo + " días atrás): " + m.summary;
      }).join("\n");
    }
    const sysPrompt = CHAT_PROMPT(profData.profile) + ctx2 + memoryContext;
    try {
      let responseText;
      if (currentAtts.length > 0) {
        // Build message with multiple attachments
        const userContent = [];
        let textPrefix = cin || "Analiza esto y dime qué relevancia tiene para mí.";
        let hasMedia = false; // images or PDFs (need vision/document model)
        const textBlocks = []; // text content from text files / unsupported

        for (const att of currentAtts) {
          if (att.mediaType.startsWith("image/")) {
            userContent.push({
              type: "image",
              source: {
                type: "base64",
                media_type: att.mediaType,
                data: att.base64
              }
            });
            hasMedia = true;
          } else if (att.mediaType === "application/pdf") {
            userContent.push({
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: att.base64
              }
            });
            hasMedia = true;
          } else if (att.isText && att.textContent) {
            textBlocks.push("--- ARCHIVO \"" + (att.fileName || "archivo") + "\" ---\n" + att.textContent + "\n--- FIN ---");
          } else if (att.unsupportedType) {
            textBlocks.push("[Adjunto no abrible: " + (att.fileName || "archivo") + " (" + att.mediaType + ")]");
          }
        }

        // Compose final text
        if (textBlocks.length > 0) {
          textPrefix = (cin || "Analiza estos archivos:") + "\n\n" + textBlocks.join("\n\n");
        }
        // If multiple images, hint to coach
        const imgCount = currentAtts.filter(a => a.mediaType.startsWith("image/")).length;
        if (imgCount > 1 && cin.trim().length === 0) {
          textPrefix = "Analiza las " + imgCount + " fotos adjuntas y dime qué ves en cada una y su relevancia para mis objetivos.";
        }
        userContent.push({
          type: "text",
          text: textPrefix
        });

        // Include conversation history (text only) plus new message with attachments
        const history = chat.slice(-8).map(m => ({
          role: m.r === "u" ? "user" : "assistant",
          content: m.t
        }));
        const allMsgs = [...history, {
          role: "user",
          content: userContent
        }];

        // Use Sonnet for vision/PDF, Haiku for text-only (faster)
        const useModel = hasMedia ? "claude-sonnet-4-5" : "claude-haiku-4-5-20251001";
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify({
            model: useModel,
            max_tokens: 1500,
            system: sysPrompt + "\n\nTienes acceso a la herramienta web_search. Si el usuario adjunta o menciona una URL, USA web_search para acceder al contenido. Si pregunta por información actual, USA web_search. NUNCA digas que no puedes abrir, leer o acceder a algo - siempre encuentra una forma de ayudar.",
            messages: allMsgs,
            tools: [{
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 3
            }]
          })
        });
        const d = await r.json();
        if (d.error) throw new Error(d.error.message);
        responseText = d.content.filter(c => c.type === "text").map(c => c.text).join("\n").trim();
        if (!responseText) responseText = "Procesé tus archivos pero no generé respuesta clara. ¿Qué quieres saber específicamente?";
      } else {
        const msgs = nc.slice(-10).map(m => ({
          role: m.r === "u" ? "user" : "assistant",
          content: m.t
        }));
        // Streaming with Haiku for fastest response
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1000,
            system: sysPrompt + "\n\nTienes acceso a la herramienta web_search. ÚSALA AGRESIVAMENTE cuando: (1) el usuario incluye una URL en su mensaje - léela; (2) pregunta por noticias/tweets/artículos/contenido externo; (3) pregunta por información actual o específica que no sabes con certeza; (4) menciona algo de lo que no tengas información completa. NUNCA digas que no puedes abrir/leer/acceder a algo - usa web_search. Integra la información naturalmente sin mencionar que buscaste.",
            messages: msgs,
            stream: true,
            tools: [{
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 3
            }]
          })
        });
        if (!r.ok) {
          const errBody = await r.text();
          throw new Error("API error: " + errBody.slice(0, 200));
        }

        // Add empty assistant message that we'll fill as stream comes
        setChat(m => [...m, {
          r: "a",
          t: ""
        }]);
        responseText = "";
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const {
            done,
            value
          } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, {
            stream: true
          });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              // Handle text deltas
              if (parsed.type === "content_block_delta" && parsed.delta && parsed.delta.type === "text_delta" && parsed.delta.text) {
                responseText += parsed.delta.text;
                setChat(m => {
                  const updated = [...m];
                  if (updated.length > 0 && updated[updated.length - 1].r === "a") {
                    updated[updated.length - 1] = {
                      ...updated[updated.length - 1],
                      t: responseText
                    };
                  }
                  return updated;
                });
              }
              // Show "Buscando en internet..." indicator when web_search starts
              if (parsed.type === "content_block_start" && parsed.content_block && parsed.content_block.type === "server_tool_use" && parsed.content_block.name === "web_search") {
                setChat(m => {
                  const updated = [...m];
                  if (updated.length > 0 && updated[updated.length - 1].r === "a") {
                    const currentText = updated[updated.length - 1].t;
                    if (!currentText.includes("🔍")) {
                      updated[updated.length - 1] = {
                        ...updated[updated.length - 1],
                        t: currentText + (currentText ? "\n\n" : "") + "🔍 Buscando información actualizada..."
                      };
                    }
                  }
                  return updated;
                });
              }
              // When search results come back, clean up the searching indicator
              if (parsed.type === "content_block_stop" && parsed.index !== undefined) {
                setChat(m => {
                  const updated = [...m];
                  if (updated.length > 0 && updated[updated.length - 1].r === "a") {
                    const cleaned = updated[updated.length - 1].t.replace(/🔍 Buscando información actualizada\.\.\.\s*/g, "");
                    if (cleaned !== updated[updated.length - 1].t) {
                      updated[updated.length - 1] = {
                        ...updated[updated.length - 1],
                        t: cleaned
                      };
                      responseText = cleaned;
                    }
                  }
                  return updated;
                });
              }
              if (parsed.type === "error") {
                throw new Error(parsed.error?.message || "Stream error");
              }
            } catch (parseErr) {
              if (parseErr.message?.includes("Stream error")) throw parseErr;
              // Ignore JSON parse errors for partial data
            }
          }
        }
      }
      // For attachment case, append normally
      if (currentAtts.length > 0) {
        setChat(m => [...m, {
          r: "a",
          t: responseText
        }]);
      }

      // Trigger memory summarization every 6 user messages
      const userMsgCount = nc.filter(m => m.r === "u").length;
      if (userMsgCount > 0 && userMsgCount % 6 === 0) {
        // Async, don't block
        (async () => {
          try {
            const convoText = nc.slice(-12).map(m => (m.r === "u" ? "Usuario" : "Coach") + ": " + m.t).join("\n");
            const summary = await api(key, MEMORY_SUMMARY_PROMPT, [{
              role: "user",
              content: convoText
            }], 200);
            if (summary && !summary.trim().toUpperCase().includes("NADA")) {
              setCoachMemory(prev => [...prev, {
                timestamp: Date.now(),
                summary: summary.trim()
              }].slice(-20));
            }
          } catch (e) {/* silently fail, no biggie */}
        })();
      }
    } catch (e) {
      setChat(m => [...m, {
        r: "a",
        t: "Error: " + e.message
      }]);
    }
    setCL(false);
  };
  const handleChatAttachment = async e => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setShowAttachMenu(false);

    // Limit to 8 attachments total to avoid hitting API limits
    const currentCount = chatAttachments.length;
    const available = 8 - currentCount;
    if (available <= 0) {
      alert("Máximo 8 archivos adjuntos. Quita alguno antes de agregar más.");
      return;
    }
    const toProcess = files.slice(0, available);
    if (files.length > available) {
      alert("Solo se agregaron " + available + " archivos. Máximo 8 adjuntos en total.");
    }
    for (const file of toProcess) {
      if (file.size > 25 * 1024 * 1024) {
        alert("Archivo \"" + file.name + "\" muy grande. Máximo 25MB. Saltado.");
        continue;
      }
      try {
        const name = (file.name || "").toLowerCase();
        const type = file.type || "";
        const textExtensions = [".txt", ".md", ".csv", ".tsv", ".json", ".xml", ".html", ".htm", ".rtf", ".log", ".js", ".css", ".py", ".sql"];
        const isTextFile = type.startsWith("text/") || type === "application/json" || type === "application/xml" || textExtensions.some(ext => name.endsWith(ext));
        if (isTextFile) {
          // Read as plain text
          const textContent = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || "").slice(0, 100000));
            reader.onerror = () => reject(new Error("read error"));
            reader.readAsText(file);
          });
          setChatAttachments(prev => [...prev, {
            id: Date.now() + Math.random(),
            base64: btoa(unescape(encodeURIComponent(textContent))),
            mediaType: "text/plain",
            fileName: file.name,
            textContent: textContent,
            isText: true,
            preview: file.name + " (" + Math.round(textContent.length / 1000) + "k caracteres)"
          }]);
          continue;
        }

        // Images and PDFs: use existing pipeline (fileToBase64 already compresses images)
        const result = await fileToBase64(file);
        result.fileName = file.name;
        result.id = Date.now() + Math.random();
        if (result.mediaType.startsWith("image/")) {
          result.preview = URL.createObjectURL(file);
        } else {
          result.preview = file.name;
        }
        if (!result.mediaType.startsWith("image/") && result.mediaType !== "application/pdf") {
          result.unsupportedType = true;
        }
        setChatAttachments(prev => [...prev, result]);
      } catch (err) {
        alert("Error con \"" + file.name + "\": " + err.message);
      }
    }

    // Reset input value so same file can be picked again
    e.target.value = "";
  };
  const removeChatAttachment = id => {
    setChatAttachments(prev => prev.filter(a => a.id !== id));
  };

  // Detect URLs in user message
  const extractUrls = text => {
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    return (text.match(urlRegex) || []).slice(0, 3); // max 3 URLs per message
  };
  const clearChatAttachment = () => {
    setChatAttachments([]);
    if (chatPhotoRef.current) chatPhotoRef.current.value = "";
    if (chatCameraRef.current) chatCameraRef.current.value = "";
    if (chatFileRef.current) chatFileRef.current.value = "";
  };
  const todayWater = waterLog[todayKey()] || 0;
  const waterGoal = Math.round((profile.weight || 80) * 0.035 * 10) / 10; // 35ml/kg in liters
  const addWater = ml => {
    const k = todayKey();
    setWaterLog(prev => ({
      ...prev,
      [k]: Math.max(0, (prev[k] || 0) + ml)
    }));
  };
  const openEditEntry = entry => {
    setEditingEntry(entry);
    setEditingItems(entry.items ? entry.items.map(it => ({
      ...it
    })) : []);
    setEditingMeal(entry.meal || "");
    setEditingText(entry.originalText || "");
    setEntryDetail(null);
  };
  const saveEditedEntry = () => {
    if (!editingEntry) return;
    const cleanedItems = editingItems.map(it => ({
      ...it,
      kcal: Number(it.kcal) || 0,
      protein: Number(it.protein) || 0,
      carbs: Number(it.carbs) || 0,
      fat: Number(it.fat) || 0,
      sugar: Number(it.sugar) || 0,
      fiber: Number(it.fiber) || 0,
      sodium: Number(it.sodium) || 0
    }));
    updateFoodEntry(editingEntry.id, {
      items: cleanedItems,
      meal: editingMeal,
      originalText: editingText,
      edited: true,
      editedAt: Date.now()
    }, editingEntry.dateKey);
    setEditingEntry(null);
  };
  const removeEditingItem = idx => {
    setEditingItems(prev => prev.filter((_, i) => i !== idx));
  };
  const addEmptyEditingItem = () => {
    setEditingItems(prev => [...prev, {
      name: "",
      qty: "",
      portion: "",
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      sugar: 0,
      fiber: 0,
      sodium: 0
    }]);
  };
  const updateEditingItem = (idx, field, value) => {
    setEditingItems(prev => prev.map((it, i) => i === idx ? {
      ...it,
      [field]: value
    } : it));
  };
  const reanalyzeEditedEntry = async () => {
    if (!key) {
      setShowKey(true);
      return;
    }
    if (!editingText.trim()) {
      alert("Necesitas describir la comida para reanalizarla");
      return;
    }
    setReanalyzing(true);
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1500,
          system: "Eres un experto en nutrición. Analiza la descripción y devuelve SOLO JSON válido sin explicación. Formato: {\"items\":[{\"name\":\"\",\"qty\":\"\",\"portion\":\"\",\"kcal\":0,\"protein\":0,\"carbs\":0,\"fat\":0,\"sugar\":0,\"fiber\":0,\"sodium\":0}]}. Sé preciso con cantidades. Si no se especifica, usa porciones estándar.",
          messages: [{
            role: "user",
            content: `Analiza esta comida y devuelve los items con sus macros:\n\n${editingText}`
          }]
        })
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      const txt = d.content[0].text.trim();
      const jsonMatch = txt.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No se pudo extraer JSON");
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.items && Array.isArray(parsed.items)) {
        setEditingItems(parsed.items);
      }
    } catch (e) {
      alert("Error reanalizando: " + e.message);
    }
    setReanalyzing(false);
  };
  const analyzeEntry = async entry => {
    if (!key) {
      setShowKey(true);
      return;
    }
    setAnalyzingEntry(true);
    setEntryAnalysis(null);
    try {
      const tg = macroTargets;
      const dayEntries = foodLog[entry.dateKey || todayKey()] || [];
      const dayTotals = sumDay(dayEntries);
      const ctx = `OBJETIVOS DEL DÍA: ${profData.target}kcal | Proteína ${tg.protein}g | Carbos ${tg.carbs}g | Grasas ${tg.fat}g | Fibra ${tg.fiber}g | Azúcar máx ${tg.sugar}g | Sodio máx 2300mg

COMIDA A ANALIZAR (${entry.meal}):
Texto original: ${entry.originalText}
Items: ${(entry.items || []).map(i => `${i.name} (${i.kcal || 0}kcal P:${i.protein || 0}g C:${i.carbs || 0}g G:${i.fat || 0}g)`).join(", ")}
Totales: ${Math.round(entry.totals.kcal)}kcal | P:${Math.round(entry.totals.protein)}g | C:${Math.round(entry.totals.carbs)}g | G:${Math.round(entry.totals.fat)}g | Azúcar:${Math.round(entry.totals.sugar || 0)}g | Fibra:${Math.round(entry.totals.fiber || 0)}g | Sodio:${Math.round(entry.totals.sodium || 0)}mg

TOTAL DEL DÍA HASTA AHORA: ${Math.round(dayTotals.kcal)}kcal | P:${Math.round(dayTotals.protein)}g | C:${Math.round(dayTotals.carbs)}g | G:${Math.round(dayTotals.fat)}g | Azúcar:${Math.round(dayTotals.sugar || 0)}g | Sodio:${Math.round(dayTotals.sodium || 0)}mg

OTRAS COMIDAS DEL DÍA: ${dayEntries.filter(e => e.id !== entry.id).map(e => e.meal + ": " + e.originalText + " (" + Math.round(e.totals.kcal) + "kcal)").join(" | ") || "Ninguna"}

Analiza esta comida específica.`;
      const response = await api(key, ENTRY_ANALYSIS_PROMPT(profData.profile), [{
        role: "user",
        content: ctx
      }], 1500);
      let jsonStr = response.replace(/```json|```/g, "").trim();
      const fb = jsonStr.indexOf("{"),
        lb = jsonStr.lastIndexOf("}");
      if (fb >= 0 && lb > fb) jsonStr = jsonStr.substring(fb, lb + 1);
      const json = JSON.parse(jsonStr);
      setEntryAnalysis(json);
    } catch (e) {
      setEntryAnalysis({
        error: "No pude analizar: " + e.message.slice(0, 150)
      });
    }
    setAnalyzingEntry(false);
  };
  const analyzeFoodEntry = async entry => {
    if (!key) {
      setShowKey(true);
      return;
    }
    if (foodAnalysis[entry.id]) {
      // Already analyzed, just show
      setFoodDetail(entry);
      return;
    }
    setFoodDetail(entry);
    setAnalyzingFood(true);
    try {
      const tg = macroTargets;
      const pctKcal = Math.round(entry.totals.kcal / profData.target * 100);
      const pctProtein = Math.round(entry.totals.protein / tg.protein * 100);
      const pctCarbs = Math.round(entry.totals.carbs / tg.carbs * 100);
      const pctFat = Math.round(entry.totals.fat / tg.fat * 100);
      const pctSugar = entry.totals.sugar ? Math.round(entry.totals.sugar / tg.sugar * 100) : 0;
      const pctSodium = entry.totals.sodium ? Math.round(entry.totals.sodium / 2300 * 100) : 0;
      const itemsDetail = (entry.items || []).map(i => `${i.name} (${i.qty || "1 porción"}): ${Math.round(i.kcal || 0)}kcal, P${Math.round(i.protein || 0)}g, C${Math.round(i.carbs || 0)}g, G${Math.round(i.fat || 0)}g${i.sugar ? ", azúcar " + Math.round(i.sugar) + "g" : ""}${i.sodium ? ", sodio " + Math.round(i.sodium) + "mg" : ""}`).join("\n");
      const ctx = `Analiza esta comida del usuario y dale un desglose honesto y útil.

COMIDA: ${entry.meal} - "${entry.originalText || "sin descripción"}"
TIMESTAMP: ${new Date(entry.timestamp).toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit"
      })}

ITEMS:
${itemsDetail}

TOTALES DE ESTA COMIDA:
- Calorías: ${Math.round(entry.totals.kcal)}kcal (${pctKcal}% del día)
- Proteína: ${Math.round(entry.totals.protein)}g (${pctProtein}% de meta diaria)
- Carbos: ${Math.round(entry.totals.carbs)}g (${pctCarbs}% de meta diaria)
- Grasas: ${Math.round(entry.totals.fat)}g (${pctFat}% de meta diaria)
${entry.totals.sugar ? `- Azúcar: ${Math.round(entry.totals.sugar)}g (${pctSugar}% del límite diario)` : ""}
${entry.totals.sodium ? `- Sodio: ${Math.round(entry.totals.sodium)}mg (${pctSodium}% del límite)` : ""}
${entry.totals.fiber ? `- Fibra: ${Math.round(entry.totals.fiber)}g` : ""}

CONTEXTO DEL USUARIO:
- Meta diaria: ${profData.target}kcal
- Objetivo: bajar de peso (déficit moderado)
- Targets: P${tg.protein}g, C${tg.carbs}g, G${tg.fat}g, fibra ${tg.fiber}g, azúcar máx ${tg.sugar}g

Devuelve SOLO un JSON válido sin markdown:
{
  "verdict": "una palabra: 'excelente', 'buena', 'regular', 'pasada' o 'mala'",
  "verdictColor": "color hex segun veredicto: excelente=#10b981, buena=#0891b2, regular=#f59e0b, pasada=#ea580c, mala=#dc2626",
  "summary": "1 oración honesta sobre esta comida",
  "culprits": [
    {"item": "nombre del item problemático o 'Ninguno'", "reason": "por qué es el principal contribuidor a un macro alto", "impact": "qué macro afecta y cuánto"}
  ],
  "wins": ["2-3 cosas BUENAS de esta comida (ej: 'buena fuente de proteína', 'fibra adecuada')"],
  "warnings": ["1-3 cosas que podrían ser problema (vacío si no hay)"],
  "swap": "1 sugerencia concreta de cómo mejorar esta misma comida la próxima vez (ej: 'cambia la tortilla de harina por maíz, ahorras 80kcal')",
  "context": "1 oración con contexto: '¿esta comida te conviene a esta hora del día? ¿es estratégica?'"
}`;
      const response = await api(key, "Eres un nutriólogo honesto y directo, en español mexicano. Sin sugar-coating pero sin ser cruel. Análisis útil y accionable.", [{
        role: "user",
        content: ctx
      }], 1500);
      let jsonStr = response.replace(/```json|```/g, "").trim();
      const firstBrace = jsonStr.indexOf("{");
      const lastBrace = jsonStr.lastIndexOf("}");
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }
      const json = JSON.parse(jsonStr);
      setFoodAnalysis(prev => ({
        ...prev,
        [entry.id]: json
      }));
    } catch (e) {
      setFoodAnalysis(prev => ({
        ...prev,
        [entry.id]: {
          error: e.message
        }
      }));
    }
    setAnalyzingFood(false);
  };
  const generateDailyMenu = async () => {
    if (!key) {
      setShowKey(true);
      return;
    }
    setGeneratingMenu(true);
    try {
      const tg = macroTargets;
      const ctx = `OBJETIVOS DEL DÍA: ${profData.target}kcal | Proteína ${tg.protein}g | Carbos ${tg.carbs}g | Grasas ${tg.fat}g | Fibra ${tg.fiber}g | Azúcar máx ${tg.sugar}g

YA CONSUMIDO HOY: ${Math.round(todayTotals.kcal)}kcal | P:${Math.round(todayTotals.protein)}g | C:${Math.round(todayTotals.carbs)}g | G:${Math.round(todayTotals.fat)}g

QUEDAN POR CONSUMIR: ${Math.max(0, profData.target - todayTotals.kcal)}kcal | P:${Math.max(0, tg.protein - todayTotals.protein)}g | C:${Math.max(0, tg.carbs - todayTotals.carbs)}g | G:${Math.max(0, tg.fat - todayTotals.fat)}g

${todayEntries.length > 0 ? "Comidas ya registradas: " + todayEntries.map(e => e.meal + ": " + e.originalText).join(" | ") : "No ha comido nada aún hoy."}

Genera el menú considerando lo que YA comió (no repetir) y completar lo que falta.`;
      const response = await api(key, DAILY_MENU_PROMPT(profData.profile, profData.target, macroTargets), [{
        role: "user",
        content: ctx
      }], 2500);
      const json = JSON.parse(response.replace(/```json|```/g, "").trim());
      setDailyMenu({
        timestamp: Date.now(),
        date: todayKey(),
        ...json
      });
    } catch (e) {
      alert("No pude generar el menú: " + e.message);
    }
    setGeneratingMenu(false);
  };
  const generateWeeklyReport = async () => {
    if (!key) {
      setShowKey(true);
      return;
    }
    setGeneratingReport(true);
    setShowReport(true);
    try {
      // Gather last 7 days of data
      const last7Days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const k = dateKey(d);
        const entries = foodLog[k] || [];
        const totals = sumDay(entries);
        if (entries.length > 0) {
          last7Days.push({
            date: k,
            day: DAYS[d.getDay()],
            entries: entries.length,
            totals: totals,
            meals: entries.map(e => ({
              meal: e.meal,
              items: e.items ? e.items.map(i => i.name).join(", ") : e.originalText,
              kcal: e.totals.kcal
            }))
          });
        }
      }
      last7Days.reverse();

      // Weight changes
      const weightLastWeek = weightHistory.filter(w => {
        const wd = new Date(w.date);
        const limit = new Date();
        limit.setDate(limit.getDate() - 7);
        return wd >= limit;
      });
      const weightStart = weightLastWeek.length > 0 ? weightLastWeek[0].weight : profile.weight;
      const weightEnd = profile.weight;
      const weightChange = (weightEnd - weightStart).toFixed(1);

      // Build context for AI
      const reportData = `DATOS DE LA SEMANA:
Peso al inicio: ${weightStart}kg
Peso ahora: ${weightEnd}kg
Cambio: ${weightChange}kg

DÍAS REGISTRADOS: ${last7Days.length} de 7
${last7Days.map(d => `${d.day} ${d.date}: ${d.totals.kcal}kcal | P:${d.totals.protein}g C:${d.totals.carbs}g G:${d.totals.fat}g 🍬${d.totals.sugar}g | ${d.entries} comidas`).join('\n')}

OBJETIVO DIARIO: ${profData.target}kcal
Promedio semanal: ${last7Days.length > 0 ? Math.round(last7Days.reduce((s, d) => s + d.totals.kcal, 0) / last7Days.length) : 0}kcal/día
Días sin registro: ${7 - last7Days.length}

Genera el reporte semanal según las instrucciones.`;
      const response = await api(key, WEEKLY_REPORT_PROMPT(profData.profile), [{
        role: "user",
        content: reportData
      }], 1500);
      setWeeklyReport({
        timestamp: Date.now(),
        content: response,
        daysAnalyzed: last7Days.length,
        weightChange: weightChange
      });
    } catch (e) {
      setWeeklyReport({
        timestamp: Date.now(),
        content: "Error generando reporte: " + e.message,
        error: true
      });
    }
    setGeneratingReport(false);
  };
  const calcStreak = () => {
    let s = 0;
    for (let i = 0; i < 60; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = dateKey(d);
      if (foodLog[k] && foodLog[k].length > 0) s++;else if (i > 0) break;
    }
    return s;
  };
  const dayEntries = foodLog[selectedDate] || [];
  const dayTotals = sumDay(dayEntries);
  const dayPlan = planData[selectedDate] || {};
  const inp = {
    width: "100%",
    background: "var(--bg-elev)",
    border: "1.5px solid var(--line)",
    borderRadius: 14,
    padding: "12px 14px",
    color: "var(--ink)",
    fontSize: 14,
    resize: "none",
    outline: "none",
    lineHeight: 1.5,
    fontFamily: "inherit",
    transition: "all 0.2s"
  };
  const card = {
    background: "rgba(255,255,255,0.85)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.6)",
    borderRadius: 24,
    padding: 20,
    marginBottom: 14,
    boxShadow: "0 1px 3px rgba(8,145,178,0.04),0 8px 24px -8px rgba(8,145,178,0.06)"
  };
  const tabs = [["today", "Hoy"], ["history", "Historial"], ["plan", "Plan"], ["recetas", "Recetas"], ["ejercicio", "Ejercicio"], ["chat", "Coach"]];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: "var(--bg)"
    }
  }, showKey && /*#__PURE__*/React.createElement("div", {
    className: "fadeIn",
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(10,31,28,0.5)",
      backdropFilter: "blur(8px)",
      zIndex: 200,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "scale",
    style: {
      background: "var(--bg-elev)",
      borderRadius: 24,
      padding: 28,
      width: "100%",
      maxWidth: 380,
      boxShadow: "0 25px 60px -15px rgba(0,0,0,0.2)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 28,
      marginBottom: 6,
      color: "var(--ink)"
    }
  }, "API Key"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--ink-soft)",
      marginBottom: 18,
      lineHeight: 1.6
    }
  }, "Obt\xE9n tu key en ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "var(--primary)"
    }
  }, "console.anthropic.com"), ". Solo se guarda en este dispositivo."), /*#__PURE__*/React.createElement("input", {
    type: "password",
    value: key,
    onChange: e => saveKey(e.target.value),
    placeholder: "sk-ant-...",
    style: {
      width: "100%",
      background: "var(--bg-sunken)",
      border: "1.5px solid var(--line)",
      borderRadius: 14,
      padding: "14px 16px",
      color: "var(--ink)",
      fontSize: 13,
      outline: "none",
      marginBottom: 14,
      fontFamily: "monospace"
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowKey(false),
    style: {
      width: "100%",
      padding: 14,
      background: "linear-gradient(135deg,var(--primary),var(--mint))",
      border: "none",
      borderRadius: 14,
      color: "#fff",
      fontSize: 14,
      fontWeight: 700,
      cursor: "pointer"
    }
  }, "Guardar"))), showFoodModal && /*#__PURE__*/React.createElement(FoodLogModal, {
    onSave: saveFoodEntry,
    onClose: () => setShowFoodModal(false),
    apiKey: key,
    askKey: () => setShowKey(true)
  }), entryDetail && /*#__PURE__*/React.createElement("div", {
    onClick: () => setEntryDetail(null),
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(10,31,28,0.6)",
      backdropFilter: "blur(8px)",
      zIndex: 200,
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: "var(--bg-elev)",
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      width: "100%",
      maxWidth: 640,
      maxHeight: "92vh",
      overflow: "auto",
      padding: "24px 22px 30px",
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 14,
      right: 14,
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => openEditEntry(entryDetail),
    style: {
      background: "var(--primary-soft)",
      border: "none",
      borderRadius: "50%",
      width: 34,
      height: 34,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 14,
      color: "var(--primary-deep)",
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent"
    },
    title: "Editar"
  }, "\u270F\uFE0F"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setEntryDetail(null),
    style: {
      background: "var(--bg-sunken)",
      border: "none",
      borderRadius: "50%",
      width: 34,
      height: 34,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 18,
      color: "var(--ink-mute)",
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent"
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 14,
      marginBottom: 18,
      paddingRight: 40
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 60,
      height: 60,
      borderRadius: 18,
      background: "var(--bg-sunken)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 32,
      flexShrink: 0
    }
  }, entryDetail.items && entryDetail.items.length > 0 ? getFoodEmoji(entryDetail.items[0].name) : MEAL_ICONS[entryDetail.meal] || "🍽️"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--primary-deep)",
      letterSpacing: 1.2,
      fontWeight: 800,
      textTransform: "uppercase"
    }
  }, entryDetail.meal), /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 22,
      color: "var(--ink)",
      lineHeight: 1.2,
      marginTop: 2
    }
  }, entryDetail.originalText && entryDetail.originalText.length < 60 ? entryDetail.originalText : entryDetail.items && entryDetail.items.map(i => i.name).join(", ")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      marginTop: 4,
      fontWeight: 500
    }
  }, new Date(entryDetail.timestamp).toLocaleTimeString("es-MX", {
    hour: "numeric",
    minute: "2-digit"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 8,
      marginBottom: 18,
      padding: "14px 12px",
      background: "var(--bg-sunken)",
      borderRadius: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 800,
      letterSpacing: 0.5,
      textTransform: "uppercase"
    }
  }, "Kcal"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      color: "var(--primary)",
      fontWeight: 800,
      marginTop: 3
    }
  }, Math.round(entryDetail.totals.kcal))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 800,
      letterSpacing: 0.5,
      textTransform: "uppercase"
    }
  }, "Prot"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      color: "var(--mint-deep)",
      fontWeight: 800,
      marginTop: 3
    }
  }, Math.round(entryDetail.totals.protein), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--ink-mute)"
    }
  }, "g"))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 800,
      letterSpacing: 0.5,
      textTransform: "uppercase"
    }
  }, "Carb"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      color: "var(--ink)",
      fontWeight: 800,
      marginTop: 3
    }
  }, Math.round(entryDetail.totals.carbs), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--ink-mute)"
    }
  }, "g"))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 800,
      letterSpacing: 0.5,
      textTransform: "uppercase"
    }
  }, "Gras"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      color: "var(--ink)",
      fontWeight: 800,
      marginTop: 3
    }
  }, Math.round(entryDetail.totals.fat), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--ink-mute)"
    }
  }, "g")))), entryDetail.items && entryDetail.items.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--ink-mute)",
      letterSpacing: 1.2,
      fontWeight: 800,
      textTransform: "uppercase",
      marginBottom: 10
    }
  }, "Lo que comiste"), entryDetail.items.map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      padding: "12px 0",
      borderBottom: i < entryDetail.items.length - 1 ? "1px solid var(--line)" : "none",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--ink)",
      fontWeight: 600,
      lineHeight: 1.3
    }
  }, it.name), it.qty && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      marginTop: 2,
      fontWeight: 500
    }
  }, it.qty), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginTop: 6,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--mint-deep)",
      background: "var(--mint-soft)",
      padding: "2px 6px",
      borderRadius: 5,
      fontWeight: 700
    }
  }, "P ", Math.round(it.protein || 0), "g"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--ink-soft)",
      background: "var(--bg-sunken)",
      padding: "2px 6px",
      borderRadius: 5,
      fontWeight: 600
    }
  }, "C ", Math.round(it.carbs || 0), "g"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--ink-soft)",
      background: "var(--bg-sunken)",
      padding: "2px 6px",
      borderRadius: 5,
      fontWeight: 600
    }
  }, "G ", Math.round(it.fat || 0), "g"))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      color: "var(--primary)",
      fontWeight: 800,
      whiteSpace: "nowrap"
    }
  }, Math.round(it.kcal || 0), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--ink-mute)",
      fontWeight: 600,
      marginLeft: 2
    }
  }, "kcal"))))), !entryAnalysis && !analyzingEntry && /*#__PURE__*/React.createElement("button", {
    onClick: () => analyzeEntry(entryDetail),
    style: {
      width: "100%",
      padding: "14px",
      background: "linear-gradient(135deg,var(--mint),var(--primary))",
      border: "none",
      borderRadius: 14,
      color: "#fff",
      fontSize: 14,
      fontWeight: 700,
      cursor: "pointer",
      letterSpacing: 0.3,
      boxShadow: "0 6px 20px -6px rgba(8,145,178,0.4)",
      WebkitTapHighlightColor: "transparent"
    }
  }, "\uD83D\uDD0D Analizar esta comida"), analyzingEntry && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "30px 20px",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement(Dots, null), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--ink-mute)",
      marginTop: 10,
      fontWeight: 500
    }
  }, "Analizando tu comida\u2026")), entryAnalysis && entryAnalysis.error && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 16px",
      background: "rgba(239,68,68,0.06)",
      border: "1px solid rgba(239,68,68,0.2)",
      borderRadius: 14,
      color: "var(--danger)",
      fontSize: 13,
      fontWeight: 600
    }
  }, entryAnalysis.error), entryAnalysis && !entryAnalysis.error && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, entryAnalysis.verdict && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 16px",
      background: entryAnalysis.verdict_type === "bad" ? "rgba(239,68,68,0.06)" : entryAnalysis.verdict_type === "good" ? "var(--mint-soft)" : "rgba(245,158,11,0.06)",
      border: entryAnalysis.verdict_type === "bad" ? "1px solid rgba(239,68,68,0.2)" : entryAnalysis.verdict_type === "good" ? "1px solid rgba(16,185,129,0.25)" : "1px solid rgba(245,158,11,0.2)",
      borderRadius: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      letterSpacing: 1.2,
      fontWeight: 800,
      textTransform: "uppercase",
      marginBottom: 6,
      color: entryAnalysis.verdict_type === "bad" ? "var(--danger)" : entryAnalysis.verdict_type === "good" ? "var(--mint-deep)" : "var(--warn)"
    }
  }, entryAnalysis.verdict_type === "bad" ? "⚠️ Te pasaste" : entryAnalysis.verdict_type === "good" ? "✓ Buena elección" : "⚡ Atención"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--ink)",
      lineHeight: 1.5,
      fontWeight: 600
    }
  }, entryAnalysis.verdict)), entryAnalysis.day_impact && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 16px",
      background: "var(--bg-sunken)",
      borderRadius: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--ink-mute)",
      letterSpacing: 1.2,
      fontWeight: 800,
      textTransform: "uppercase",
      marginBottom: 8
    }
  }, "\uD83D\uDCCA Impacto en tu d\xEDa"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--ink)",
      lineHeight: 1.5
    }
  }, entryAnalysis.day_impact)), entryAnalysis.culprit && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 16px",
      background: "rgba(245,158,11,0.06)",
      border: "1px solid rgba(245,158,11,0.2)",
      borderRadius: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#d97706",
      letterSpacing: 1.2,
      fontWeight: 800,
      textTransform: "uppercase",
      marginBottom: 8
    }
  }, "\uD83C\uDFAF Lo que m\xE1s pes\xF3"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--ink)",
      lineHeight: 1.5
    }
  }, entryAnalysis.culprit)), entryAnalysis.alternatives && entryAnalysis.alternatives.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 16px",
      background: "linear-gradient(135deg,rgba(16,185,129,0.06),rgba(8,145,178,0.04))",
      border: "1px solid var(--mint-soft)",
      borderRadius: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--mint-deep)",
      letterSpacing: 1.2,
      fontWeight: 800,
      textTransform: "uppercase",
      marginBottom: 10
    }
  }, "\uD83D\uDCA1 Alternativas mejores"), entryAnalysis.alternatives.map((alt, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      padding: "6px 0",
      borderTop: i > 0 ? "1px solid var(--mint-soft)" : "none"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 5,
      height: 5,
      borderRadius: "50%",
      background: "var(--mint)",
      marginTop: 8,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontSize: 13,
      color: "var(--ink)",
      lineHeight: 1.5
    }
  }, alt)))), entryAnalysis.next_time && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 16px",
      background: "var(--primary-soft)",
      borderRadius: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--primary-deep)",
      letterSpacing: 1.2,
      fontWeight: 800,
      textTransform: "uppercase",
      marginBottom: 8
    }
  }, "\uD83D\uDE80 Para la pr\xF3xima"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--ink)",
      lineHeight: 1.5
    }
  }, entryAnalysis.next_time))))), editingEntry && /*#__PURE__*/React.createElement("div", {
    onClick: () => setEditingEntry(null),
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(10,31,28,0.6)",
      backdropFilter: "blur(8px)",
      zIndex: 250,
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: "var(--bg-elev)",
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      width: "100%",
      maxWidth: 640,
      maxHeight: "94vh",
      overflow: "auto",
      padding: "24px 22px 30px",
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--primary-deep)",
      letterSpacing: 1.2,
      fontWeight: 800,
      textTransform: "uppercase"
    }
  }, "Editar comida"), /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 22,
      color: "var(--ink)",
      lineHeight: 1.2,
      marginTop: 2
    }
  }, "Corregir registro")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setEditingEntry(null),
    style: {
      background: "var(--bg-sunken)",
      border: "none",
      borderRadius: "50%",
      width: 34,
      height: 34,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 18,
      color: "var(--ink-mute)",
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent"
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--ink-mute)",
      letterSpacing: 1.2,
      fontWeight: 800,
      textTransform: "uppercase",
      marginBottom: 8
    }
  }, "Tipo de comida"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 6
    }
  }, ["desayuno", "comida", "cena", "snack"].map(m => /*#__PURE__*/React.createElement("button", {
    key: m,
    onClick: () => setEditingMeal(m),
    style: {
      padding: "10px 6px",
      borderRadius: 10,
      border: editingMeal === m ? "1.5px solid var(--primary)" : "1.5px solid var(--line)",
      background: editingMeal === m ? "var(--primary-soft)" : "var(--bg-elev)",
      color: editingMeal === m ? "var(--primary-deep)" : "var(--ink-soft)",
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent",
      textTransform: "capitalize"
    }
  }, m)))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--ink-mute)",
      letterSpacing: 1.2,
      fontWeight: 800,
      textTransform: "uppercase"
    }
  }, "Descripci\xF3n"), /*#__PURE__*/React.createElement("button", {
    onClick: reanalyzeEditedEntry,
    disabled: reanalyzing || !editingText.trim(),
    style: {
      background: reanalyzing || !editingText.trim() ? "var(--bg-sunken)" : "linear-gradient(135deg,var(--primary),var(--mint))",
      border: "none",
      borderRadius: 8,
      padding: "6px 12px",
      color: reanalyzing || !editingText.trim() ? "var(--ink-mute)" : "#fff",
      fontSize: 11,
      fontWeight: 700,
      cursor: reanalyzing || !editingText.trim() ? "not-allowed" : "pointer",
      WebkitTapHighlightColor: "transparent"
    }
  }, reanalyzing ? "Analizando..." : "🔄 Reanalizar con IA")), /*#__PURE__*/React.createElement("textarea", {
    value: editingText,
    onChange: e => setEditingText(e.target.value),
    placeholder: "Describe lo que comiste...",
    rows: 3,
    style: {
      width: "100%",
      padding: "12px 14px",
      border: "1.5px solid var(--line)",
      borderRadius: 12,
      fontSize: 14,
      background: "var(--bg-sunken)",
      color: "var(--ink)",
      resize: "vertical",
      fontFamily: "inherit",
      lineHeight: 1.5,
      outline: "none",
      boxSizing: "border-box"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--ink-mute)",
      marginTop: 6,
      fontStyle: "italic"
    }
  }, "\uD83D\uDCA1 Modifica la descripci\xF3n y toca \"Reanalizar\" para que la IA recalcule los items y macros")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--ink-mute)",
      letterSpacing: 1.2,
      fontWeight: 800,
      textTransform: "uppercase"
    }
  }, "Items (", editingItems.length, ")"), /*#__PURE__*/React.createElement("button", {
    onClick: addEmptyEditingItem,
    style: {
      background: "var(--primary-soft)",
      border: "none",
      borderRadius: 8,
      padding: "5px 10px",
      color: "var(--primary-deep)",
      fontSize: 11,
      fontWeight: 700,
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent"
    }
  }, "+ Agregar item")), editingItems.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "20px",
      textAlign: "center",
      background: "var(--bg-sunken)",
      borderRadius: 12,
      fontSize: 13,
      color: "var(--ink-mute)"
    }
  }, "Sin items. Reanaliza con IA o agrega manualmente.") : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, editingItems.map((it, idx) => /*#__PURE__*/React.createElement("div", {
    key: idx,
    style: {
      padding: "12px",
      background: "var(--bg-sunken)",
      borderRadius: 12,
      border: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: it.name || "",
    onChange: e => updateEditingItem(idx, "name", e.target.value),
    placeholder: "Nombre del alimento",
    style: {
      flex: 1,
      padding: "8px 10px",
      border: "1px solid var(--line)",
      borderRadius: 8,
      fontSize: 13,
      background: "var(--bg-elev)",
      color: "var(--ink)",
      fontWeight: 600,
      outline: "none",
      fontFamily: "inherit"
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => removeEditingItem(idx),
    style: {
      background: "transparent",
      border: "none",
      color: "var(--danger)",
      cursor: "pointer",
      fontSize: 18,
      padding: "4px 8px",
      fontWeight: 600,
      WebkitTapHighlightColor: "transparent"
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("input", {
    value: it.qty || it.portion || "",
    onChange: e => updateEditingItem(idx, "qty", e.target.value),
    placeholder: "Cantidad (ej: 1 taza, 100g)",
    style: {
      width: "100%",
      padding: "7px 10px",
      border: "1px solid var(--line)",
      borderRadius: 8,
      fontSize: 12,
      background: "var(--bg-elev)",
      color: "var(--ink-soft)",
      outline: "none",
      marginBottom: 8,
      fontFamily: "inherit",
      boxSizing: "border-box"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 700,
      marginBottom: 3,
      textAlign: "center"
    }
  }, "Kcal"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    inputMode: "decimal",
    value: it.kcal || 0,
    onChange: e => updateEditingItem(idx, "kcal", e.target.value),
    style: {
      width: "100%",
      padding: "6px 4px",
      border: "1px solid var(--line)",
      borderRadius: 7,
      fontSize: 12,
      background: "var(--bg-elev)",
      color: "var(--primary)",
      fontWeight: 700,
      textAlign: "center",
      outline: "none",
      fontFamily: "inherit",
      boxSizing: "border-box"
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 700,
      marginBottom: 3,
      textAlign: "center"
    }
  }, "Prot"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    inputMode: "decimal",
    value: it.protein || 0,
    onChange: e => updateEditingItem(idx, "protein", e.target.value),
    style: {
      width: "100%",
      padding: "6px 4px",
      border: "1px solid var(--line)",
      borderRadius: 7,
      fontSize: 12,
      background: "var(--bg-elev)",
      color: "var(--mint-deep)",
      fontWeight: 700,
      textAlign: "center",
      outline: "none",
      fontFamily: "inherit",
      boxSizing: "border-box"
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 700,
      marginBottom: 3,
      textAlign: "center"
    }
  }, "Carb"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    inputMode: "decimal",
    value: it.carbs || 0,
    onChange: e => updateEditingItem(idx, "carbs", e.target.value),
    style: {
      width: "100%",
      padding: "6px 4px",
      border: "1px solid var(--line)",
      borderRadius: 7,
      fontSize: 12,
      background: "var(--bg-elev)",
      color: "var(--ink)",
      fontWeight: 700,
      textAlign: "center",
      outline: "none",
      fontFamily: "inherit",
      boxSizing: "border-box"
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 700,
      marginBottom: 3,
      textAlign: "center"
    }
  }, "Gras"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    inputMode: "decimal",
    value: it.fat || 0,
    onChange: e => updateEditingItem(idx, "fat", e.target.value),
    style: {
      width: "100%",
      padding: "6px 4px",
      border: "1px solid var(--line)",
      borderRadius: 7,
      fontSize: 12,
      background: "var(--bg-elev)",
      color: "var(--ink)",
      fontWeight: 700,
      textAlign: "center",
      outline: "none",
      fontFamily: "inherit",
      boxSizing: "border-box"
    }
  }))))))), editingItems.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 14px",
      background: "linear-gradient(135deg,rgba(8,145,178,0.08),rgba(16,185,129,0.06))",
      border: "1px solid var(--primary-soft)",
      borderRadius: 12,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--primary-deep)",
      letterSpacing: 1.2,
      fontWeight: 800,
      textTransform: "uppercase",
      marginBottom: 6
    }
  }, "Totales nuevos"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 6,
      fontSize: 12,
      fontWeight: 700,
      color: "var(--ink)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, Math.round(editingItems.reduce((s, it) => s + (Number(it.kcal) || 0), 0)), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)"
    }
  }, "kcal")), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, Math.round(editingItems.reduce((s, it) => s + (Number(it.protein) || 0), 0)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)"
    }
  }, "g P")), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, Math.round(editingItems.reduce((s, it) => s + (Number(it.carbs) || 0), 0)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)"
    }
  }, "g C")), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, Math.round(editingItems.reduce((s, it) => s + (Number(it.fat) || 0), 0)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)"
    }
  }, "g G")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setEditingEntry(null),
    style: {
      flex: 1,
      padding: 14,
      background: "var(--bg-sunken)",
      border: "none",
      borderRadius: 14,
      color: "var(--ink-soft)",
      fontSize: 14,
      fontWeight: 700,
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent"
    }
  }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
    onClick: saveEditedEntry,
    disabled: !editingMeal || editingItems.length === 0,
    style: {
      flex: 2,
      padding: 14,
      background: !editingMeal || editingItems.length === 0 ? "var(--bg-sunken)" : "linear-gradient(135deg,var(--primary),var(--mint))",
      border: "none",
      borderRadius: 14,
      color: !editingMeal || editingItems.length === 0 ? "var(--ink-mute)" : "#fff",
      fontSize: 14,
      fontWeight: 700,
      cursor: !editingMeal || editingItems.length === 0 ? "not-allowed" : "pointer",
      letterSpacing: 0.3,
      boxShadow: !editingMeal || editingItems.length === 0 ? "none" : "0 6px 20px -6px rgba(8,145,178,0.4)",
      WebkitTapHighlightColor: "transparent"
    }
  }, "Guardar cambios")))), foodDetail && /*#__PURE__*/React.createElement("div", {
    onClick: () => setFoodDetail(null),
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(10,31,28,0.5)",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
      zIndex: 1000,
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center",
      padding: "0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: "var(--bg-elev)",
      borderRadius: "24px 24px 0 0",
      width: "100%",
      maxWidth: 480,
      maxHeight: "90vh",
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
      padding: "22px 22px 100px",
      boxShadow: "0 -10px 40px rgba(0,0,0,0.15)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--ink-mute)",
      letterSpacing: 1.2,
      fontWeight: 800,
      textTransform: "uppercase"
    }
  }, foodDetail.meal, " \xB7 ", new Date(foodDetail.timestamp).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit"
  })), /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 22,
      color: "var(--ink)",
      lineHeight: 1.2,
      marginTop: 4
    }
  }, foodDetail.items && foodDetail.items.length > 0 ? foodDetail.items.map(i => i.name).join(", ") : "Comida")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setFoodDetail(null),
    style: {
      background: "var(--bg-sunken)",
      border: "none",
      borderRadius: "50%",
      width: 32,
      height: 32,
      fontSize: 18,
      color: "var(--ink-mute)",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      marginLeft: 10
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 8,
      marginBottom: 18,
      padding: "14px 0",
      borderTop: "1px solid var(--line)",
      borderBottom: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 800,
      letterSpacing: 0.5
    }
  }, "KCAL"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      color: "var(--primary)",
      fontWeight: 800,
      marginTop: 2
    }
  }, Math.round(foodDetail.totals.kcal)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 600
    }
  }, Math.round(foodDetail.totals.kcal / profData.target * 100), "% del d\xEDa")), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 800,
      letterSpacing: 0.5
    }
  }, "PROT"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      color: "var(--mint-deep)",
      fontWeight: 800,
      marginTop: 2
    }
  }, Math.round(foodDetail.totals.protein), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--ink-mute)"
    }
  }, "g")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 600
    }
  }, Math.round(foodDetail.totals.protein / macroTargets.protein * 100), "%")), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 800,
      letterSpacing: 0.5
    }
  }, "CARB"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      color: "var(--ink)",
      fontWeight: 800,
      marginTop: 2
    }
  }, Math.round(foodDetail.totals.carbs), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--ink-mute)"
    }
  }, "g")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 600
    }
  }, Math.round(foodDetail.totals.carbs / macroTargets.carbs * 100), "%")), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 800,
      letterSpacing: 0.5
    }
  }, "GRAS"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      color: "var(--ink)",
      fontWeight: 800,
      marginTop: 2
    }
  }, Math.round(foodDetail.totals.fat), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--ink-mute)"
    }
  }, "g")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 600
    }
  }, Math.round(foodDetail.totals.fat / macroTargets.fat * 100), "%"))), foodDetail.items && foodDetail.items.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--ink-mute)",
      letterSpacing: 1.2,
      fontWeight: 800,
      textTransform: "uppercase",
      marginBottom: 10
    }
  }, "Desglose por ingrediente"), foodDetail.items.map((item, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      padding: "10px 0",
      borderBottom: i < foodDetail.items.length - 1 ? "1px solid var(--line)" : "none"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--ink)",
      fontWeight: 600,
      flex: 1
    }
  }, item.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--primary)",
      fontWeight: 700,
      marginLeft: 10
    }
  }, Math.round(item.kcal || 0), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--ink-mute)",
      fontWeight: 500,
      marginLeft: 2
    }
  }, "kcal"))), item.qty && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      marginBottom: 4
    }
  }, item.qty), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap"
    }
  }, item.protein > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--mint-deep)",
      background: "var(--mint-soft)",
      padding: "2px 7px",
      borderRadius: 6,
      fontWeight: 700
    }
  }, "P ", Math.round(item.protein), "g"), item.carbs > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--ink-soft)",
      background: "var(--bg-sunken)",
      padding: "2px 7px",
      borderRadius: 6,
      fontWeight: 600
    }
  }, "C ", Math.round(item.carbs), "g"), item.fat > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--ink-soft)",
      background: "var(--bg-sunken)",
      padding: "2px 7px",
      borderRadius: 6,
      fontWeight: 600
    }
  }, "G ", Math.round(item.fat), "g"), item.sugar > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "#d97706",
      background: "rgba(245,158,11,0.1)",
      padding: "2px 7px",
      borderRadius: 6,
      fontWeight: 700
    }
  }, "\uD83C\uDF6F ", Math.round(item.sugar), "g"), item.sodium > 200 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--ink-soft)",
      background: "var(--bg-sunken)",
      padding: "2px 7px",
      borderRadius: 6,
      fontWeight: 600
    }
  }, "\uD83E\uDDC2 ", Math.round(item.sodium), "mg"), item.fiber > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--mint-deep)",
      background: "var(--mint-soft)",
      padding: "2px 7px",
      borderRadius: 6,
      fontWeight: 600
    }
  }, "\uD83C\uDF3E ", Math.round(item.fiber), "g"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--ink-mute)",
      letterSpacing: 1.2,
      fontWeight: 800,
      textTransform: "uppercase"
    }
  }, "\uD83E\uDDE0 An\xE1lisis del coach")), analyzingFood && !foodAnalysis[foodDetail.id] && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "30px 20px",
      textAlign: "center",
      background: "var(--bg-sunken)",
      borderRadius: 14
    }
  }, /*#__PURE__*/React.createElement(Dots, null), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--ink-mute)",
      marginTop: 10,
      fontWeight: 500
    }
  }, "Analizando esta comida\u2026")), foodAnalysis[foodDetail.id] && !foodAnalysis[foodDetail.id].error && (() => {
    const a = foodAnalysis[foodDetail.id];
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "14px 16px",
        background: `linear-gradient(135deg, ${a.verdictColor || "#0891b2"}15, ${a.verdictColor || "#0891b2"}08)`,
        border: `1px solid ${a.verdictColor || "#0891b2"}30`,
        borderRadius: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: a.verdictColor || "var(--primary)",
        fontWeight: 800,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        marginBottom: 4
      }
    }, a.verdict), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 14,
        color: "var(--ink)",
        lineHeight: 1.5,
        fontWeight: 500
      }
    }, a.summary)), a.wins && a.wins.length > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "12px 14px",
        background: "var(--mint-soft)",
        borderRadius: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: "var(--mint-deep)",
        letterSpacing: 1,
        fontWeight: 800,
        marginBottom: 8
      }
    }, "\u2713 A FAVOR"), a.wins.map((w, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "3px 0"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--mint-deep)",
        fontSize: 11,
        fontWeight: 800,
        marginTop: 1
      }
    }, "\u2022"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        fontSize: 13,
        color: "var(--ink)",
        lineHeight: 1.4
      }
    }, w)))), (a.warnings && a.warnings.length > 0 || a.culprits && a.culprits.length > 0 && a.culprits[0].item !== "Ninguno") && /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "12px 14px",
        background: "rgba(245,158,11,0.08)",
        border: "1px solid rgba(245,158,11,0.2)",
        borderRadius: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: "#d97706",
        letterSpacing: 1,
        fontWeight: 800,
        marginBottom: 8
      }
    }, "\u26A0\uFE0F EN CONTRA"), a.warnings && a.warnings.map((w, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "3px 0"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        color: "#d97706",
        fontSize: 11,
        fontWeight: 800,
        marginTop: 1
      }
    }, "\u2022"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        fontSize: 13,
        color: "var(--ink)",
        lineHeight: 1.4
      }
    }, w))), a.culprits && a.culprits.map((c, i) => c.item !== "Ninguno" && /*#__PURE__*/React.createElement("div", {
      key: "c" + i,
      style: {
        marginTop: 8,
        padding: "10px 12px",
        background: "var(--bg-elev)",
        borderRadius: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "#d97706",
        fontWeight: 800,
        marginBottom: 3
      }
    }, "\uD83C\uDFAF Principal contribuidor: ", c.item), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "var(--ink)",
        lineHeight: 1.4,
        marginBottom: 4
      }
    }, c.reason), c.impact && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "var(--ink-mute)",
        fontWeight: 600
      }
    }, c.impact)))), a.swap && /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "12px 14px",
        background: "linear-gradient(135deg,rgba(8,145,178,0.06),rgba(16,185,129,0.06))",
        border: "1px solid var(--primary-soft)",
        borderRadius: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: "var(--primary-deep)",
        letterSpacing: 1,
        fontWeight: 800,
        marginBottom: 6
      }
    }, "\uD83D\uDCA1 PARA LA PR\xD3XIMA"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: "var(--ink)",
        lineHeight: 1.5
      }
    }, a.swap)), a.context && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "var(--ink-mute)",
        lineHeight: 1.5,
        fontStyle: "italic",
        padding: "6px 4px"
      }
    }, a.context));
  })(), foodAnalysis[foodDetail.id] && foodAnalysis[foodDetail.id].error && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 14,
      background: "rgba(239,68,68,0.05)",
      borderRadius: 12,
      fontSize: 12,
      color: "var(--danger)"
    }
  }, "No pude generar el an\xE1lisis. ", foodAnalysis[foodDetail.id].error)))), /*#__PURE__*/React.createElement("div", {
    className: "glass",
    style: {
      padding: "18px 20px 14px",
      position: "sticky",
      top: 0,
      zIndex: 50,
      background: "rgba(240,250,250,0.7)",
      borderBottom: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: () => setShowProfile(true),
    style: {
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 32,
      color: "var(--ink)",
      lineHeight: 1
    }
  }, "Hola, ", /*#__PURE__*/React.createElement("em", null, profile.name)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      fontWeight: 600,
      letterSpacing: 0.8,
      marginTop: 4,
      textTransform: "uppercase"
    }
  }, "Tap para editar")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowKey(true),
    style: {
      background: "var(--bg-sunken)",
      border: "1px solid var(--line)",
      borderRadius: 12,
      padding: "8px 13px",
      color: "var(--ink-soft)",
      fontSize: 11,
      cursor: "pointer",
      fontWeight: 600,
      letterSpacing: 0.5
    }
  }, "API")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 0,
      overflowX: "auto",
      scrollbarWidth: "none",
      margin: "0 -20px",
      padding: "0 20px"
    }
  }, tabs.map(([id, lb]) => /*#__PURE__*/React.createElement("button", {
    key: id,
    onClick: () => {
      setTab(id);
      if (id === "today") setSelectedDate(todayKey());
    },
    style: {
      padding: "10px 14px 12px",
      border: "none",
      cursor: "pointer",
      fontSize: 14,
      fontWeight: 600,
      background: "transparent",
      color: tab === id ? "var(--ink)" : "var(--ink-mute)",
      position: "relative",
      whiteSpace: "nowrap",
      letterSpacing: -0.2
    }
  }, lb, tab === id && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      bottom: -1,
      left: 14,
      right: 14,
      height: 2,
      background: "linear-gradient(90deg,var(--primary),var(--mint))",
      borderRadius: 2
    }
  }))))), tab === "today" && /*#__PURE__*/React.createElement("div", {
    className: "fade",
    style: {
      padding: "20px 20px 100px",
      maxWidth: 640,
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: () => {
      setEditKg(true);
      setTmpKg(String(profile.weight));
    },
    style: {
      cursor: "pointer",
      marginBottom: 14
    }
  }, editKg ? /*#__PURE__*/React.createElement("div", {
    style: {
      ...card,
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      fontWeight: 600,
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: 8
    }
  }, "Actualizar peso"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: tmpKg,
    onChange: e => setTmpKg(e.target.value),
    autoFocus: true,
    onKeyDown: e => {
      if (e.key === "Enter") {
        const v = parseFloat(tmpKg);
        if (!isNaN(v) && v > 30 && v < 300) updateWeight(v);
        setEditKg(false);
      }
    },
    style: {
      flex: 1,
      background: "var(--bg-elev)",
      border: "1.5px solid var(--primary)",
      borderRadius: 12,
      padding: "12px 14px",
      color: "var(--primary)",
      fontSize: 24,
      fontWeight: 700,
      outline: "none",
      fontFamily: "inherit"
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      const v = parseFloat(tmpKg);
      if (!isNaN(v) && v > 30 && v < 300) updateWeight(v);
      setEditKg(false);
    },
    style: {
      background: "linear-gradient(135deg,var(--primary),var(--mint))",
      border: "none",
      borderRadius: 12,
      padding: "12px 18px",
      color: "#fff",
      fontWeight: 700,
      cursor: "pointer"
    }
  }, "OK"))) : /*#__PURE__*/React.createElement(WeightStat, {
    current: profile.weight,
    start: profile.startWeight,
    goal: profile.goalWeight,
    history: weightHistory
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      ...card,
      padding: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 22
    }
  }, "\uD83D\uDCA7"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: "var(--ink)"
    }
  }, "Agua"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      fontWeight: 500
    }
  }, "Meta: ", waterGoal, "L (", Math.round(waterGoal * 1000), "ml)"))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 28,
      color: todayWater >= waterGoal * 1000 ? "var(--mint-deep)" : "var(--primary)",
      lineHeight: 1
    }
  }, (todayWater / 1000).toFixed(1)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--ink-mute)",
      fontWeight: 600
    }
  }, "litros hoy"))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 7,
      background: "var(--bg-sunken)",
      borderRadius: 6,
      overflow: "hidden",
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: Math.min(100, todayWater / (waterGoal * 1000) * 100) + "%",
      background: "linear-gradient(90deg,#38bdf8,var(--primary))",
      borderRadius: 6,
      transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 8
    }
  }, [{
    ml: 150,
    icon: "🥛",
    label: "Vaso"
  }, {
    ml: 250,
    icon: "🥤",
    label: "Taza"
  }, {
    ml: 500,
    icon: "🍶",
    label: "Botella"
  }, {
    ml: -200,
    icon: "↩",
    label: "Quitar"
  }].map(({
    ml,
    icon,
    label
  }) => /*#__PURE__*/React.createElement("button", {
    key: ml,
    type: "button",
    onClick: () => addWater(ml),
    style: {
      padding: "10px 4px",
      borderRadius: 12,
      border: "1.5px solid var(--line)",
      background: ml < 0 ? "var(--bg-sunken)" : "var(--bg-elev)",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 4,
      WebkitTapHighlightColor: "transparent",
      touchAction: "manipulation"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18
    }
  }, icon), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: "var(--ink)"
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)"
    }
  }, ml > 0 ? "+" + ml + "ml" : ml + "ml")))), todayWater >= waterGoal * 1000 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      padding: "8px 12px",
      background: "var(--mint-soft)",
      borderRadius: 10,
      fontSize: 12,
      color: "var(--mint-deep)",
      fontWeight: 700,
      textAlign: "center"
    }
  }, "\u2713 Meta de agua alcanzada \uD83C\uDF89")), /*#__PURE__*/React.createElement("div", {
    style: {
      ...card,
      padding: 0,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 18px",
      borderBottom: dailyMenu && dailyMenu.date === todayKey() ? "1px solid var(--line)" : "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 11,
      background: "linear-gradient(135deg,var(--mint),var(--primary))",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 18
    }
  }, "\uD83C\uDF7D\uFE0F"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: "var(--ink)"
    }
  }, "Men\xFA del d\xEDa"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      fontWeight: 500
    }
  }, "Sugerido para tu meta"))), /*#__PURE__*/React.createElement("button", {
    onClick: generateDailyMenu,
    disabled: generatingMenu,
    style: {
      background: "var(--bg-sunken)",
      border: "1px solid var(--line)",
      borderRadius: 10,
      padding: "6px 12px",
      color: "var(--primary)",
      fontSize: 11,
      fontWeight: 700,
      cursor: generatingMenu ? "wait" : "pointer",
      letterSpacing: 0.3,
      WebkitTapHighlightColor: "transparent"
    }
  }, generatingMenu ? "..." : dailyMenu && dailyMenu.date === todayKey() ? "↻ Otro" : "Generar")), generatingMenu && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "30px 20px",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement(Dots, null), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--ink-mute)",
      marginTop: 10,
      fontWeight: 500
    }
  }, "Dise\xF1ando tu men\xFA del d\xEDa\u2026")), !generatingMenu && dailyMenu && dailyMenu.date === todayKey() && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "4px 18px 16px"
    }
  }, dailyMenu.summary && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--ink-soft)",
      fontStyle: "italic",
      lineHeight: 1.5,
      padding: "12px 0",
      borderBottom: "1px solid var(--line)"
    }
  }, "\"", dailyMenu.summary, "\""), dailyMenu.meals && dailyMenu.meals.map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      padding: "14px 0",
      borderBottom: i < dailyMenu.meals.length - 1 ? "1px solid var(--line)" : "none"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 38,
      height: 38,
      borderRadius: 11,
      background: "var(--bg-sunken)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 18,
      flexShrink: 0
    }
  }, m.emoji || "🍽️"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--primary-deep)",
      letterSpacing: 1.2,
      fontWeight: 800,
      textTransform: "uppercase"
    }
  }, m.type), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--ink)",
      fontWeight: 700,
      marginTop: 2,
      lineHeight: 1.3
    }
  }, m.name), m.description && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--ink-mute)",
      marginTop: 4,
      lineHeight: 1.4
    }
  }, m.description), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginTop: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--primary-deep)",
      background: "var(--primary-soft)",
      padding: "2px 7px",
      borderRadius: 6,
      fontWeight: 700
    }
  }, m.kcal, "kcal"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--mint-deep)",
      background: "var(--mint-soft)",
      padding: "2px 7px",
      borderRadius: 6,
      fontWeight: 700
    }
  }, "P ", m.protein, "g"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--ink-soft)",
      background: "var(--bg-sunken)",
      padding: "2px 7px",
      borderRadius: 6,
      fontWeight: 600
    }
  }, "C ", m.carbs, "g"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--ink-soft)",
      background: "var(--bg-sunken)",
      padding: "2px 7px",
      borderRadius: 6,
      fontWeight: 600
    }
  }, "G ", m.fat, "g")), m.ingredients && m.ingredients.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      padding: "10px 12px",
      background: "var(--bg-sunken)",
      borderRadius: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 800,
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: 6
    }
  }, "Ingredientes"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 3
    }
  }, m.ingredients.map((ing, j) => /*#__PURE__*/React.createElement("div", {
    key: j,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 12,
      color: "var(--ink)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 4,
      height: 4,
      borderRadius: "50%",
      background: "var(--mint)",
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      lineHeight: 1.4
    }
  }, ing))))), m.highlight && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--mint-deep)",
      marginTop: 8,
      fontWeight: 600,
      fontStyle: "italic"
    }
  }, "\uD83D\uDCA1 ", m.highlight))))), dailyMenu.shoppingList && dailyMenu.shoppingList.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      padding: "14px 16px",
      background: "linear-gradient(135deg,rgba(16,185,129,0.06),rgba(8,145,178,0.04))",
      border: "1px solid var(--mint-soft)",
      borderRadius: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--mint-deep)",
      letterSpacing: 1.2,
      fontWeight: 800,
      textTransform: "uppercase",
      marginBottom: 10
    }
  }, "\uD83D\uDED2 Lista de compras del d\xEDa"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 5
    }
  }, dailyMenu.shoppingList.map((item, j) => /*#__PURE__*/React.createElement("div", {
    key: j,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      fontSize: 12,
      color: "var(--ink)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 14,
      height: 14,
      borderRadius: 4,
      border: "1.5px solid var(--mint)",
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      lineHeight: 1.4
    }
  }, item))))), dailyMenu.totals && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 6,
      marginTop: 14,
      padding: "14px 0 0",
      borderTop: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: "uppercase"
    }
  }, "Total"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      color: "var(--primary)",
      fontWeight: 800,
      marginTop: 3
    }
  }, dailyMenu.totals.kcal, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)"
    }
  }, "kcal"))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: "uppercase"
    }
  }, "Prot"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      color: "var(--mint-deep)",
      fontWeight: 800,
      marginTop: 3
    }
  }, dailyMenu.totals.protein, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)"
    }
  }, "g"))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: "uppercase"
    }
  }, "Carb"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      color: "var(--ink)",
      fontWeight: 800,
      marginTop: 3
    }
  }, dailyMenu.totals.carbs, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)"
    }
  }, "g"))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)",
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: "uppercase"
    }
  }, "Gras"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      color: "var(--ink)",
      fontWeight: 800,
      marginTop: 3
    }
  }, dailyMenu.totals.fat, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: "var(--ink-mute)"
    }
  }, "g")))), dailyMenu.tips && dailyMenu.tips.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      padding: "14px 16px",
      background: "linear-gradient(135deg,rgba(245,158,11,0.06),rgba(245,158,11,0.02))",
      border: "1px solid rgba(245,158,11,0.18)",
      borderRadius: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#d97706",
      letterSpacing: 1.2,
      fontWeight: 800,
      textTransform: "uppercase",
      marginBottom: 8
    }
  }, "\uD83D\uDCA1 Tips de hoy"), dailyMenu.tips.map((t, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      padding: "4px 0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 5,
      height: 5,
      borderRadius: "50%",
      background: "#d97706",
      marginTop: 8,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontSize: 13,
      color: "var(--ink)",
      lineHeight: 1.5
    }
  }, t))))), !generatingMenu && (!dailyMenu || dailyMenu.date !== todayKey()) && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "22px 20px",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 32,
      marginBottom: 8
    }
  }, "\uD83C\uDF73"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--ink)",
      fontWeight: 600,
      marginBottom: 4
    }
  }, "Tu men\xFA personalizado"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      lineHeight: 1.5,
      maxWidth: 300,
      margin: "0 auto"
    }
  }, "Toca \"Generar\" para que la IA arme un men\xFA completo basado en tus metas, lo que comiste hoy y tus preferencias."))), /*#__PURE__*/React.createElement("div", {
    style: {
      ...card,
      padding: 0,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 18px 10px",
      borderBottom: "1px solid var(--line)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 10,
      background: "linear-gradient(135deg,var(--primary),var(--mint))",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 16
    }
  }, "\uD83E\uDDE0"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: "var(--ink)"
    }
  }, "Coach")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setTab("chat"),
    style: {
      fontSize: 11,
      color: "var(--primary)",
      fontWeight: 700,
      background: "none",
      border: "none",
      cursor: "pointer",
      padding: "4px 8px"
    }
  }, "Ver todo \u203A")), chatAttachments.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "fade",
    style: {
      padding: "10px 14px",
      borderBottom: "1px solid var(--line)",
      background: "var(--primary-soft)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--primary-deep)",
      fontWeight: 700
    }
  }, chatAttachments.length, " ", chatAttachments.length === 1 ? "archivo" : "archivos"), chatAttachments.length > 1 && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: clearChatAttachment,
    style: {
      background: "transparent",
      border: "none",
      fontSize: 10,
      color: "var(--ink-mute)",
      cursor: "pointer",
      fontWeight: 600,
      textDecoration: "underline"
    }
  }, "quitar todos")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      overflowX: "auto",
      paddingBottom: 2
    }
  }, chatAttachments.map(att => /*#__PURE__*/React.createElement("div", {
    key: att.id,
    style: {
      position: "relative",
      flexShrink: 0
    }
  }, att.mediaType.startsWith("image/") ? /*#__PURE__*/React.createElement("img", {
    src: att.preview,
    alt: "",
    style: {
      width: 48,
      height: 48,
      objectFit: "cover",
      borderRadius: 8,
      border: "1.5px solid var(--line)"
    }
  }) : /*#__PURE__*/React.createElement("div", {
    title: att.fileName,
    style: {
      width: 48,
      height: 48,
      background: "var(--bg-elev)",
      borderRadius: 8,
      border: "1.5px solid var(--line)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 18
    }
  }, att.mediaType === "application/pdf" ? "📄" : att.isText ? "📝" : "📎"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => removeChatAttachment(att.id),
    style: {
      position: "absolute",
      top: -5,
      right: -5,
      background: "var(--ink)",
      border: "2px solid var(--bg)",
      borderRadius: "50%",
      width: 18,
      height: 18,
      color: "#fff",
      fontSize: 11,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
      WebkitTapHighlightColor: "transparent",
      fontWeight: 700
    }
  }, "\xD7"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 18px 14px",
      display: "flex",
      gap: 8,
      alignItems: "flex-end"
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setShowAttachMenu(true),
    style: {
      background: "var(--bg-sunken)",
      border: "1.5px solid var(--line)",
      borderRadius: 12,
      padding: "10px 12px",
      color: "var(--primary)",
      fontSize: 18,
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent",
      touchAction: "manipulation",
      flexShrink: 0
    }
  }, "+"), /*#__PURE__*/React.createElement("textarea", {
    rows: 2,
    value: cin,
    onChange: e => setCin(e.target.value),
    onKeyDown: e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        setTab("chat");
        sendChat();
      }
    },
    placeholder: chatAttachments.length > 0 ? "Mensaje opcional…" : "Pregunta algo rápido…",
    style: {
      flex: 1,
      background: "var(--bg-sunken)",
      border: "1.5px solid var(--line)",
      borderRadius: 12,
      padding: "10px 12px",
      color: "var(--ink)",
      fontSize: 14,
      resize: "none",
      outline: "none",
      lineHeight: 1.5,
      fontFamily: "inherit"
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setTab("chat");
      sendChat();
    },
    disabled: !cin.trim() && chatAttachments.length === 0 || cL,
    style: {
      background: !cin.trim() && chatAttachments.length === 0 || cL ? "var(--bg-sunken)" : "linear-gradient(135deg,var(--primary),var(--mint))",
      border: "none",
      borderRadius: 12,
      padding: "10px 14px",
      color: !cin.trim() && chatAttachments.length === 0 || cL ? "var(--ink-mute)" : "#fff",
      fontSize: 16,
      cursor: !cin.trim() && chatAttachments.length === 0 || cL ? "not-allowed" : "pointer",
      flexShrink: 0
    }
  }, "\u2191"))), calcStreak() > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      ...card,
      padding: 16,
      background: "linear-gradient(135deg,#fff7ed,#ffedd5)",
      border: "1px solid #fed7aa",
      display: "flex",
      alignItems: "center",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 32
    },
    className: "float"
  }, "\uD83D\uDD25"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      color: "#c2410c",
      fontWeight: 800,
      lineHeight: 1
    }
  }, calcStreak(), " ", calcStreak() === 1 ? "día" : "días"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#9a3412",
      marginTop: 2,
      fontWeight: 500
    }
  }, "de racha activa"))), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      if (weeklyReport && !generatingReport) {
        setShowReport(true);
      } else {
        generateWeeklyReport();
      }
    },
    disabled: generatingReport,
    style: {
      ...card,
      padding: 16,
      width: "100%",
      cursor: generatingReport ? "wait" : "pointer",
      border: "1px solid var(--line)",
      background: "linear-gradient(135deg,rgba(8,145,178,0.06),rgba(16,185,129,0.04))",
      display: "flex",
      alignItems: "center",
      gap: 14,
      WebkitTapHighlightColor: "transparent",
      touchAction: "manipulation",
      textAlign: "left"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 46,
      height: 46,
      borderRadius: 14,
      background: "linear-gradient(135deg,var(--primary),var(--mint))",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 22,
      color: "#fff",
      flexShrink: 0,
      boxShadow: "0 4px 12px -4px rgba(8,145,178,0.4)"
    }
  }, "\uD83D\uDCCA"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      color: "var(--ink)",
      fontWeight: 700,
      lineHeight: 1.2
    }
  }, generatingReport ? "Generando reporte…" : weeklyReport ? "Mi reporte semanal" : "Generar reporte semanal"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--ink-mute)",
      marginTop: 3,
      fontWeight: 500
    }
  }, generatingReport ? "Analizando últimos 7 días" : weeklyReport ? "Toca para ver tu análisis" : "IA analiza tus últimos 7 días")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      color: "var(--ink-mute)"
    }
  }, "\u203A")), /*#__PURE__*/React.createElement("div", {
    style: {
      ...card,
      padding: 28,
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      fontWeight: 600,
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: 18
    }
  }, "Calor\xEDas hoy"), /*#__PURE__*/React.createElement(Ring, {
    value: Math.round(todayTotals.kcal),
    max: profData.target,
    size: 220,
    color: remaining < 0 ? "var(--danger)" : "var(--primary)",
    thickness: 14
  }, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 64,
      color: remaining < 0 ? "var(--danger)" : "var(--ink)",
      lineHeight: 0.9,
      fontWeight: 400
    }
  }, Math.round(todayTotals.kcal)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--ink-mute)",
      fontWeight: 600,
      marginTop: 4
    }
  }, "de ", profData.target)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20,
      padding: "12px 20px",
      background: remaining < 0 ? "rgba(239,68,68,0.08)" : "var(--mint-soft)",
      borderRadius: 16,
      fontSize: 13,
      fontWeight: 700,
      color: remaining < 0 ? "var(--danger)" : "var(--mint-deep)",
      display: "inline-block"
    }
  }, remaining > 0 ? `${Math.round(remaining)} kcal restantes` : `${Math.abs(Math.round(remaining))} kcal sobre el límite`)), dayEntries.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: card
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 24,
      color: "var(--ink)"
    }
  }, "Macros"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      fontWeight: 600,
      letterSpacing: 0.5,
      textTransform: "uppercase"
    }
  }, "Distribuci\xF3n")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,1fr)",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(MacroRing, {
    label: "Prote\xEDna",
    icon: "\uD83E\uDED8",
    current: todayTotals.protein,
    target: macroTargets.protein,
    color: "var(--mint)",
    onClick: () => setMacroDetail({
      key: "protein",
      label: "Proteína",
      icon: "🫘",
      current: todayTotals.protein,
      target: macroTargets.protein,
      unit: "g",
      isLimit: false
    })
  }), /*#__PURE__*/React.createElement(MacroRing, {
    label: "Carbos",
    icon: "\uD83C\uDF5E",
    current: todayTotals.carbs,
    target: macroTargets.carbs,
    color: "var(--primary)",
    onClick: () => setMacroDetail({
      key: "carbs",
      label: "Carbohidratos",
      icon: "🍞",
      current: todayTotals.carbs,
      target: macroTargets.carbs,
      unit: "g",
      isLimit: false
    })
  }), /*#__PURE__*/React.createElement(MacroRing, {
    label: "Grasas",
    icon: "\uD83E\uDD51",
    current: todayTotals.fat,
    target: macroTargets.fat,
    color: "var(--warn)",
    onClick: () => setMacroDetail({
      key: "fat",
      label: "Grasas",
      icon: "🥑",
      current: todayTotals.fat,
      target: macroTargets.fat,
      unit: "g",
      isLimit: false
    })
  }), /*#__PURE__*/React.createElement(MacroRing, {
    label: "Az\xFAcar",
    icon: "\uD83C\uDF6F",
    current: todayTotals.sugar,
    target: macroTargets.sugar,
    color: "#f59e0b",
    isLimit: true,
    onClick: () => setMacroDetail({
      key: "sugar",
      label: "Azúcar",
      icon: "🍯",
      current: todayTotals.sugar,
      target: macroTargets.sugar,
      unit: "g",
      isLimit: true
    })
  }), /*#__PURE__*/React.createElement(MacroRing, {
    label: "Fibra",
    icon: "\uD83C\uDF3E",
    current: todayTotals.fiber,
    target: macroTargets.fiber,
    color: "var(--mint-deep)",
    onClick: () => setMacroDetail({
      key: "fiber",
      label: "Fibra",
      icon: "🌾",
      current: todayTotals.fiber,
      target: macroTargets.fiber,
      unit: "g",
      isLimit: false
    })
  }), /*#__PURE__*/React.createElement(MacroRing, {
    label: "Sodio",
    icon: "\uD83E\uDDC2",
    current: todayTotals.sodium,
    target: 2300,
    unit: "mg",
    color: "var(--ink-soft)",
    isLimit: true,
    onClick: () => setMacroDetail({
      key: "sodium",
      label: "Sodio",
      icon: "🧂",
      current: todayTotals.sodium,
      target: 2300,
      unit: "mg",
      isLimit: true
    })
  }))), alerts.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, alerts.map((a, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "fade",
    style: {
      background: a.type === "high" ? "rgba(239,68,68,0.05)" : "rgba(245,158,11,0.05)",
      border: a.type === "high" ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(245,158,11,0.2)",
      borderRadius: 16,
      padding: "14px 16px",
      marginBottom: 8,
      fontSize: 13,
      color: a.type === "high" ? "var(--danger)" : "var(--warn)",
      lineHeight: 1.5,
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: a.type === "high" ? "var(--danger)" : "var(--warn)",
      flexShrink: 0
    }
  }), a.text))), /*#__PURE__*/React.createElement("div", {
    style: card
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 24,
      color: "var(--ink)"
    }
  }, "Hoy"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowFoodModal(true),
    style: {
      background: "linear-gradient(135deg,var(--mint),var(--primary))",
      border: "none",
      borderRadius: 12,
      padding: "8px 16px",
      color: "#fff",
      fontSize: 13,
      fontWeight: 700,
      cursor: "pointer",
      letterSpacing: 0.3,
      boxShadow: "0 4px 14px -4px rgba(16,185,129,0.4)"
    }
  }, "+ Agregar")), dayEntries.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "40px 16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 48,
      marginBottom: 12,
      opacity: 0.3
    }
  }, "\uD83C\uDF7D\uFE0F"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      color: "var(--ink-soft)",
      fontWeight: 600,
      marginBottom: 4
    }
  }, "Sin comidas registradas"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--ink-mute)"
    }
  }, "Toca \"Agregar\" para empezar tu d\xEDa")) : dayEntries.sort((a, b) => a.timestamp - b.timestamp).map(entry => /*#__PURE__*/React.createElement("div", {
    key: entry.id,
    className: "fade tap-effect",
    onClick: () => {
      setEntryDetail({
        ...entry,
        dateKey: selectedDate
      });
      setEntryAnalysis(null);
    },
    style: {
      padding: "14px 0",
      borderBottom: "1px solid var(--line)",
      display: "flex",
      gap: 14,
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 24,
      flexShrink: 0,
      width: 42,
      height: 42,
      borderRadius: 12,
      background: "var(--bg-sunken)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, entry.items && entry.items.length > 0 ? getFoodEmoji(entry.items[0].name) : MEAL_ICONS[entry.meal] || "🍽️"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      letterSpacing: 1,
      fontWeight: 700,
      textTransform: "uppercase"
    }
  }, entry.meal), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      color: "var(--primary)",
      fontWeight: 800
    }
  }, Math.round(entry.totals.kcal), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--ink-mute)",
      fontWeight: 600,
      marginLeft: 2
    }
  }, "kcal")), /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      deleteFoodEntry(entry.id);
    },
    style: {
      background: "transparent",
      border: "none",
      color: "var(--ink-mute)",
      cursor: "pointer",
      fontSize: 18,
      padding: "0 4px",
      fontWeight: 300
    }
  }, "\xD7"))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--ink)",
      marginBottom: 5,
      lineHeight: 1.4,
      fontWeight: 500
    }
  }, entry.items && entry.items.map(i => i.name).join(", ")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      fontWeight: 500
    }
  }, "P:", Math.round(entry.totals.protein), "g \xB7 C:", Math.round(entry.totals.carbs), "g \xB7 G:", Math.round(entry.totals.fat), "g \xB7 ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--primary)",
      fontWeight: 600
    }
  }, "tap para an\xE1lisis \u2192"))))))), tab === "history" && /*#__PURE__*/React.createElement("div", {
    className: "fade",
    style: {
      padding: "20px 20px 80px",
      maxWidth: 640,
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: card
  }, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 28,
      color: "var(--ink)",
      marginBottom: 18
    }
  }, "\xDAltimos 30 d\xEDas"), allDates.map(date => {
    const entries = foodLog[date] || [];
    const totals = sumDay(entries);
    const isToday = date === todayKey();
    const has = entries.length > 0;
    return /*#__PURE__*/React.createElement("div", {
      key: date,
      onClick: () => {
        setSelectedDate(date);
        setTab("today");
      },
      className: "tap-effect",
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "14px 0",
        borderBottom: "1px solid var(--line)",
        cursor: "pointer"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 15,
        color: isToday ? "var(--primary)" : "var(--ink)",
        fontWeight: isToday ? 700 : 600
      }
    }, fmtDate(date), isToday && " · Hoy"), has ? /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "var(--ink-mute)",
        marginTop: 3,
        fontWeight: 500
      }
    }, entries.length, " comida", entries.length > 1 ? "s" : "", " \xB7 P:", Math.round(totals.protein), "g \xB7 C:", Math.round(totals.carbs), "g \xB7 G:", Math.round(totals.fat), "g") : /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "var(--ink-mute)",
        marginTop: 3,
        opacity: 0.5
      }
    }, "Sin registros")), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "right"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "serif",
      style: {
        fontSize: 24,
        color: has ? totals.kcal > profData.target ? "var(--danger)" : "var(--ink)" : "var(--ink-mute)",
        lineHeight: 1,
        fontWeight: 400
      }
    }, has ? Math.round(totals.kcal) : "—"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "var(--ink-mute)",
        fontWeight: 600,
        letterSpacing: 0.5,
        marginTop: 2
      }
    }, has ? "KCAL" : "")));
  }))), tab === "plan" && /*#__PURE__*/React.createElement("div", {
    className: "fade",
    style: {
      padding: "20px 20px 80px",
      maxWidth: 640,
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...card,
      background: "linear-gradient(135deg,var(--primary-soft),#fff)",
      border: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 24,
      color: "var(--ink)",
      marginBottom: 6
    }
  }, "Plan de comidas"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--ink-soft)",
      lineHeight: 1.6
    }
  }, "Sugerencias adaptadas a tu perfil. Despu\xE9s de comer, registra en Hoy.")), /*#__PURE__*/React.createElement("div", {
    style: card
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginBottom: 16,
      padding: 4,
      background: "var(--bg-sunken)",
      borderRadius: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setPlanMode("n"),
    style: {
      flex: 1,
      padding: "10px 0",
      borderRadius: 9,
      border: "none",
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 700,
      background: planMode === "n" ? "var(--bg-elev)" : "transparent",
      color: planMode === "n" ? "var(--ink)" : "var(--ink-mute)",
      transition: "all 0.2s",
      boxShadow: planMode === "n" ? "0 2px 6px rgba(0,0,0,0.05)" : "none"
    }
  }, "Plan del d\xEDa"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setPlanMode("r"),
    style: {
      flex: 1,
      padding: "10px 0",
      borderRadius: 9,
      border: "none",
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 700,
      background: planMode === "r" ? "var(--bg-elev)" : "transparent",
      color: planMode === "r" ? "var(--ink)" : "var(--ink-mute)",
      transition: "all 0.2s",
      boxShadow: planMode === "r" ? "0 2px 6px rgba(0,0,0,0.05)" : "none"
    }
  }, "Restaurante")), /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      letterSpacing: 1.5,
      textTransform: "uppercase",
      fontWeight: 700,
      marginBottom: 8,
      display: "block"
    }
  }, planMode === "r" ? "Tipo de restaurante" : "Dónde estás?"), /*#__PURE__*/React.createElement("textarea", {
    rows: 2,
    value: planCtx,
    onChange: e => setPlanCtx(e.target.value),
    placeholder: planMode === "r" ? "Ej: Restaurante de mariscos..." : "Ej: En casa con pollo...",
    style: inp
  }), planMode === "n" && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 8
    }
  }, ["En casa", "Viajando", "Oficina", "Comida rápida", "Hotel"].map(h => /*#__PURE__*/React.createElement("div", {
    key: h,
    onClick: () => setPlanCtx(c => c ? c + " + " + h : h),
    style: {
      background: "var(--bg-sunken)",
      border: "1px solid var(--line)",
      borderRadius: 20,
      padding: "5px 12px",
      fontSize: 12,
      color: "var(--ink-soft)",
      cursor: "pointer",
      fontWeight: 600
    }
  }, h))), planMode === "r" && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11,
      color: "var(--primary)",
      letterSpacing: 1.5,
      textTransform: "uppercase",
      fontWeight: 700,
      marginBottom: 8,
      display: "block"
    }
  }, "Carta del men\xFA"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginBottom: 12,
      padding: 4,
      background: "var(--bg-sunken)",
      borderRadius: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      setMenuInputMode("text");
      clearPhoto();
    },
    style: {
      flex: 1,
      padding: "10px 0",
      borderRadius: 9,
      border: "none",
      cursor: "pointer",
      fontSize: 12,
      fontWeight: 700,
      background: menuInputMode === "text" ? "var(--bg-elev)" : "transparent",
      color: menuInputMode === "text" ? "var(--ink)" : "var(--ink-mute)",
      transition: "all 0.2s",
      boxShadow: menuInputMode === "text" ? "0 2px 6px rgba(0,0,0,0.05)" : "none",
      WebkitTapHighlightColor: "transparent",
      touchAction: "manipulation"
    }
  }, "\u270D\uFE0F Escribir"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setMenuInputMode("photo"),
    style: {
      flex: 1,
      padding: "10px 0",
      borderRadius: 9,
      border: "none",
      cursor: "pointer",
      fontSize: 12,
      fontWeight: 700,
      background: menuInputMode === "photo" ? "var(--bg-elev)" : "transparent",
      color: menuInputMode === "photo" ? "var(--ink)" : "var(--ink-mute)",
      transition: "all 0.2s",
      boxShadow: menuInputMode === "photo" ? "0 2px 6px rgba(0,0,0,0.05)" : "none",
      WebkitTapHighlightColor: "transparent",
      touchAction: "manipulation"
    }
  }, "\uD83D\uDCF7 Foto")), menuInputMode === "text" && /*#__PURE__*/React.createElement("textarea", {
    rows: 5,
    value: planMenu,
    onChange: e => setPlanMenu(e.target.value),
    placeholder: "Pega los platillos del men\xFA...",
    style: {
      ...inp,
      fontSize: 14,
      lineHeight: 1.7
    }
  }), menuInputMode === "photo" && /*#__PURE__*/React.createElement("div", null, !menuPhotoPreview ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => cameraInputRef.current && cameraInputRef.current.click(),
    style: {
      padding: "24px 12px",
      borderRadius: 14,
      border: "2px dashed var(--line-strong)",
      background: "var(--bg-sunken)",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      WebkitTapHighlightColor: "transparent",
      touchAction: "manipulation"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 34
    }
  }, "\uD83D\uDCF8"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--ink)",
      fontWeight: 700
    }
  }, "Tomar foto"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      textAlign: "center",
      lineHeight: 1.4
    }
  }, "De la carta del men\xFA")), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => photoInputRef.current && photoInputRef.current.click(),
    style: {
      padding: "24px 12px",
      borderRadius: 14,
      border: "2px dashed var(--line-strong)",
      background: "var(--bg-sunken)",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      WebkitTapHighlightColor: "transparent",
      touchAction: "manipulation"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 34
    }
  }, "\uD83D\uDDBC\uFE0F"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--ink)",
      fontWeight: 700
    }
  }, "Galer\xEDa"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      textAlign: "center",
      lineHeight: 1.4
    }
  }, "Subir foto guardada")), /*#__PURE__*/React.createElement("input", {
    ref: cameraInputRef,
    type: "file",
    accept: "image/*",
    capture: "environment",
    onChange: handlePhotoSelect,
    style: {
      display: "none"
    }
  }), /*#__PURE__*/React.createElement("input", {
    ref: photoInputRef,
    type: "file",
    accept: "image/*",
    onChange: handlePhotoSelect,
    style: {
      display: "none"
    }
  })) : /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      borderRadius: 14,
      overflow: "hidden",
      border: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: menuPhotoPreview,
    alt: "Men\xFA",
    style: {
      width: "100%",
      display: "block",
      maxHeight: 280,
      objectFit: "contain",
      background: "var(--bg-sunken)"
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: clearPhoto,
    style: {
      position: "absolute",
      top: 8,
      right: 8,
      background: "rgba(0,0,0,0.6)",
      border: "none",
      borderRadius: "50%",
      width: 32,
      height: 32,
      color: "#fff",
      fontSize: 18,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      WebkitTapHighlightColor: "transparent"
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      marginTop: 10,
      lineHeight: 1.5,
      padding: "8px 12px",
      background: "var(--primary-soft)",
      borderRadius: 10
    }
  }, "\uD83D\uDCA1 ", /*#__PURE__*/React.createElement("strong", null, "Tip:"), " Toma foto directa del men\xFA impreso. Si el restaurante tiene QR, escan\xE9alo con la c\xE1mara de tu iPhone, abre la p\xE1gina, y luego toma screenshot del men\xFA para subirlo aqu\xED."))), /*#__PURE__*/React.createElement("button", {
    onClick: askMeal,
    disabled: !planCtx.trim() || dayPlan.ml || analyzingPhoto,
    style: {
      width: "100%",
      padding: 14,
      marginTop: 14,
      background: !planCtx.trim() || dayPlan.ml ? "var(--bg-sunken)" : "linear-gradient(135deg,var(--primary),var(--mint))",
      border: "none",
      borderRadius: 14,
      color: !planCtx.trim() || dayPlan.ml ? "var(--ink-mute)" : "#fff",
      fontSize: 15,
      fontWeight: 700,
      cursor: !planCtx.trim() || dayPlan.ml ? "not-allowed" : "pointer",
      letterSpacing: 0.3,
      boxShadow: !planCtx.trim() || dayPlan.ml ? "none" : "0 6px 20px -6px rgba(8,145,178,0.4)"
    }
  }, analyzingPhoto ? "Leyendo carta…" : dayPlan.ml ? "Calculando…" : planMode === "r" ? "Qué pido" : "Ver plan")), dayPlan.ml && /*#__PURE__*/React.createElement("div", {
    style: card
  }, /*#__PURE__*/React.createElement(Dots, null)), !dayPlan.ml && dayPlan.mr && /*#__PURE__*/React.createElement("div", {
    style: {
      ...card,
      borderLeft: "3px solid var(--primary)",
      lineHeight: 1.85,
      fontSize: 14,
      whiteSpace: "pre-wrap",
      color: "var(--ink)"
    }
  }, dayPlan.mr)), tab === "ejercicio" && /*#__PURE__*/React.createElement("div", {
    className: "fade",
    style: {
      padding: "20px 20px 80px",
      maxWidth: 640,
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...card,
      background: "linear-gradient(135deg,var(--mint-soft),#fff)",
      border: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 24,
      color: "var(--ink)",
      marginBottom: 6
    }
  }, "Tu rutina"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--ink-soft)",
      lineHeight: 1.6
    }
  }, dayEntries.length > 0 ? `Ajustada a las ${dayEntries.length} comida(s) que registraste` : "Registra primero tu comida para mejor precisión")), /*#__PURE__*/React.createElement("div", {
    style: card
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      letterSpacing: 1.5,
      textTransform: "uppercase",
      fontWeight: 700,
      marginBottom: 8,
      display: "block"
    }
  }, "Contexto"), /*#__PURE__*/React.createElement("textarea", {
    rows: 2,
    value: exCtx,
    onChange: e => setExCtx(e.target.value),
    placeholder: "Ej: Tengo 30 min, en hotel, d\xEDa de descanso...",
    style: inp
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 8,
      marginBottom: 14
    }
  }, ["30 min", "1 hora", "En casa", "En hotel", "Sin equipo", "Descanso"].map(h => /*#__PURE__*/React.createElement("div", {
    key: h,
    onClick: () => setExCtx(c => c ? c + " + " + h : h),
    style: {
      background: "var(--bg-sunken)",
      border: "1px solid var(--line)",
      borderRadius: 20,
      padding: "5px 12px",
      fontSize: 12,
      color: "var(--ink-soft)",
      cursor: "pointer",
      fontWeight: 600
    }
  }, h))), /*#__PURE__*/React.createElement("button", {
    onClick: askEx,
    disabled: dayPlan.el,
    style: {
      width: "100%",
      padding: 14,
      background: dayPlan.el ? "var(--bg-sunken)" : "linear-gradient(135deg,var(--mint),var(--mint-deep))",
      border: "none",
      borderRadius: 14,
      color: dayPlan.el ? "var(--ink-mute)" : "#fff",
      fontSize: 15,
      fontWeight: 700,
      cursor: dayPlan.el ? "not-allowed" : "pointer",
      letterSpacing: 0.3,
      boxShadow: dayPlan.el ? "none" : "0 6px 20px -6px rgba(16,185,129,0.4)"
    }
  }, dayPlan.el ? "Generando rutina…" : "Ver ejercicios")), dayPlan.el && /*#__PURE__*/React.createElement("div", {
    style: card
  }, /*#__PURE__*/React.createElement(Dots, null)), !dayPlan.el && dayPlan.er && /*#__PURE__*/React.createElement("div", {
    style: {
      ...card,
      borderLeft: "3px solid var(--mint)",
      lineHeight: 1.85,
      fontSize: 14,
      whiteSpace: "pre-wrap",
      color: "var(--ink)"
    }
  }, dayPlan.er)), tab === "recetas" && /*#__PURE__*/React.createElement("div", {
    className: "fade",
    style: {
      padding: "4px 20px 100px",
      maxWidth: 640,
      margin: "0 auto",
      display: "flex",
      flexDirection: "column",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 18px",
      background: "linear-gradient(135deg,rgba(8,145,178,0.08),rgba(16,185,129,0.06))",
      border: "1px solid var(--line)",
      borderRadius: 18,
      display: "flex",
      alignItems: "center",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 30
    }
  }, "\uD83D\uDC68\u200D\uD83C\uDF73"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 22,
      color: "var(--ink)",
      lineHeight: 1.1
    }
  }, "Recetario"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--ink-mute)",
      marginTop: 4,
      lineHeight: 1.4,
      fontWeight: 500
    }
  }, "40 recetas. Sin verduras visibles, sin salm\xF3n."))), !showRecipe && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 6,
      padding: 4,
      background: "var(--bg-sunken)",
      borderRadius: 14
    }
  }, [{
    id: "desayuno",
    label: "Desayuno",
    emoji: "☀️"
  }, {
    id: "comida",
    label: "Comida",
    emoji: "🍽️"
  }, {
    id: "cena",
    label: "Cena",
    emoji: "🌙"
  }, {
    id: "snack",
    label: "Snacks",
    emoji: "🥨"
  }].map(c => /*#__PURE__*/React.createElement("button", {
    key: c.id,
    type: "button",
    onClick: () => setRecipeCategory(c.id),
    style: {
      padding: "10px 4px",
      borderRadius: 11,
      border: "none",
      cursor: "pointer",
      fontSize: 11,
      fontWeight: 700,
      background: recipeCategory === c.id ? "var(--bg-elev)" : "transparent",
      color: recipeCategory === c.id ? "var(--ink)" : "var(--ink-mute)",
      transition: "all 0.2s",
      boxShadow: recipeCategory === c.id ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
      WebkitTapHighlightColor: "transparent",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14
    }
  }, c.emoji), /*#__PURE__*/React.createElement("span", null, c.label)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }
  }, RECIPES.filter(r => r.category === recipeCategory).map(r => /*#__PURE__*/React.createElement("button", {
    key: r.id,
    type: "button",
    onClick: () => setShowRecipe(r.id),
    style: {
      padding: 0,
      background: "var(--bg-elev)",
      border: "1px solid var(--line)",
      borderRadius: 18,
      cursor: "pointer",
      overflow: "hidden",
      textAlign: "left",
      WebkitTapHighlightColor: "transparent",
      touchAction: "manipulation",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 96,
      background: "linear-gradient(135deg,var(--bg-sunken),var(--mint-soft))",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 48
    }
  }, r.emoji), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 14px",
      flex: 1,
      display: "flex",
      flexDirection: "column",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--ink)",
      fontWeight: 700,
      lineHeight: 1.25,
      minHeight: 32
    }
  }, r.name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--primary-deep)",
      background: "var(--primary-soft)",
      padding: "2px 7px",
      borderRadius: 6,
      fontWeight: 700
    }
  }, r.kcal, "kcal"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--mint-deep)",
      background: "var(--mint-soft)",
      padding: "2px 7px",
      borderRadius: 6,
      fontWeight: 700
    }
  }, "P ", r.protein, "g")), r.hidden && r.hidden.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--mint-deep)",
      fontWeight: 600,
      marginTop: 2
    }
  }, "\uD83E\uDD77 Esconde ", r.hidden.length, " ", r.hidden.length === 1 ? "verdura" : "verduras")))))), showRecipe && (() => {
    const r = RECIPES.find(x => x.id === showRecipe);
    if (!r) return null;
    return /*#__PURE__*/React.createElement("div", {
      className: "fade",
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 14
      }
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setShowRecipe(null),
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "transparent",
        border: "none",
        color: "var(--primary)",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        padding: "4px 0",
        WebkitTapHighlightColor: "transparent"
      }
    }, "\u2190 Todas las recetas"), /*#__PURE__*/React.createElement("div", {
      style: {
        background: "linear-gradient(135deg,var(--bg-sunken),var(--mint-soft))",
        borderRadius: 24,
        padding: "40px 20px",
        textAlign: "center",
        border: "1px solid var(--line)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 80,
        lineHeight: 1,
        marginBottom: 14
      }
    }, r.emoji), /*#__PURE__*/React.createElement("div", {
      className: "serif",
      style: {
        fontSize: 26,
        color: "var(--ink)",
        lineHeight: 1.15,
        padding: "0 10px"
      }
    }, r.name)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "12px 8px",
        background: "var(--bg-elev)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "var(--ink-mute)",
        fontWeight: 700,
        letterSpacing: 1,
        textTransform: "uppercase"
      }
    }, "Tiempo"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: "var(--ink)",
        fontWeight: 800,
        marginTop: 4
      }
    }, r.time)), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "12px 8px",
        background: "var(--bg-elev)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "var(--ink-mute)",
        fontWeight: 700,
        letterSpacing: 1,
        textTransform: "uppercase"
      }
    }, "Calor\xEDas"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: "var(--primary)",
        fontWeight: 800,
        marginTop: 4
      }
    }, r.kcal)), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "12px 8px",
        background: "var(--bg-elev)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "var(--ink-mute)",
        fontWeight: 700,
        letterSpacing: 1,
        textTransform: "uppercase"
      }
    }, "Dificultad"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: "var(--ink)",
        fontWeight: 800,
        marginTop: 4
      }
    }, r.difficulty))), r.hidden && r.hidden.length > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "14px 18px",
        background: "linear-gradient(135deg,rgba(16,185,129,0.08),rgba(8,145,178,0.05))",
        border: "1px solid var(--mint-soft)",
        borderRadius: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "var(--mint-deep)",
        fontWeight: 800,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        marginBottom: 6
      }
    }, "\uD83E\uDD77 Verduras escondidas"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: "var(--ink)",
        fontWeight: 600,
        lineHeight: 1.5
      }
    }, r.hidden.join(" · "))), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "16px 18px",
        background: "var(--bg-elev)",
        border: "1px solid var(--line)",
        borderRadius: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 14,
        color: "var(--ink-soft)",
        lineHeight: 1.6,
        fontStyle: "italic"
      }
    }, "\"", r.description, "\"")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "var(--ink-mute)",
        letterSpacing: 1.5,
        fontWeight: 700,
        textTransform: "uppercase",
        marginBottom: 10
      }
    }, "Ingredientes"), /*#__PURE__*/React.createElement("div", {
      style: {
        background: "var(--bg-elev)",
        border: "1px solid var(--line)",
        borderRadius: 16,
        overflow: "hidden"
      }
    }, r.ingredients.map((ing, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        padding: "10px 16px",
        borderBottom: i < r.ingredients.length - 1 ? "1px solid var(--line)" : "none",
        fontSize: 13,
        color: "var(--ink)",
        display: "flex",
        alignItems: "center",
        gap: 10
      }
    }, ing.toUpperCase() === ing && ing.length > 5 ? /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "var(--primary-deep)",
        fontWeight: 800,
        letterSpacing: 1,
        textTransform: "uppercase"
      }
    }, ing.replace(":", "")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: "var(--mint)",
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        lineHeight: 1.5
      }
    }, ing)))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "var(--ink-mute)",
        letterSpacing: 1.5,
        fontWeight: 700,
        textTransform: "uppercase",
        marginBottom: 10
      }
    }, "Preparaci\xF3n"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 8
      }
    }, r.steps.map((step, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        background: "var(--bg-elev)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        padding: "14px 16px",
        display: "flex",
        gap: 12,
        alignItems: "flex-start"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: "linear-gradient(135deg,var(--primary),var(--mint))",
        color: "#fff",
        fontSize: 12,
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        boxShadow: "0 2px 6px -2px rgba(8,145,178,0.4)"
      }
    }, i + 1), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        fontSize: 13,
        color: "var(--ink)",
        lineHeight: 1.55,
        paddingTop: 4
      }
    }, step))))), r.trick && /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "16px 18px",
        background: "linear-gradient(135deg,rgba(245,158,11,0.08),rgba(245,158,11,0.04))",
        border: "1px solid rgba(245,158,11,0.2)",
        borderRadius: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "#d97706",
        fontWeight: 800,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        marginBottom: 6
      }
    }, "\uD83D\uDCA1 Truco del chef"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: "var(--ink)",
        lineHeight: 1.6
      }
    }, r.trick)), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => setShowRecipe(null),
      style: {
        width: "100%",
        padding: 16,
        marginTop: 8,
        background: "linear-gradient(135deg,var(--primary),var(--mint))",
        border: "none",
        borderRadius: 16,
        color: "#fff",
        fontSize: 15,
        fontWeight: 700,
        cursor: "pointer",
        letterSpacing: 0.3,
        boxShadow: "0 8px 24px -8px rgba(8,145,178,0.4)",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation"
      }
    }, "\u2190 Volver a recetas"));
  })()), tab === "chat" && /*#__PURE__*/React.createElement("div", {
    className: "fade",
    style: {
      display: "flex",
      flexDirection: "column",
      height: "calc(100vh - 145px)"
    }
  }, coachMemory.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "6px 20px",
      maxWidth: 640,
      width: "100%",
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: "6px 12px",
      background: "var(--mint-soft)",
      border: "1px solid var(--line)",
      borderRadius: 20,
      fontSize: 11,
      color: "var(--mint-deep)",
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement("span", null, "\uD83E\uDDE0 Coach con memoria de ", coachMemory.length, " ", coachMemory.length === 1 ? "conversación" : "conversaciones"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      if (confirm("¿Borrar la memoria del coach? Empezará desde cero.")) {
        setCoachMemory([]);
        setChat([{
          r: "a",
          t: `Hola ${profile.name}. Empezamos desde cero. ¿En qué te ayudo?`
        }]);
      }
    },
    style: {
      background: "transparent",
      border: "none",
      color: "var(--ink-mute)",
      fontSize: 11,
      cursor: "pointer",
      fontWeight: 600,
      textDecoration: "underline"
    }
  }, "borrar"))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: "14px 20px 8px",
      maxWidth: 640,
      width: "100%",
      margin: "0 auto"
    }
  }, chat.map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "fade",
    style: {
      marginBottom: 12,
      display: "flex",
      flexDirection: "column",
      alignItems: m.r === "u" ? "flex-end" : "flex-start"
    }
  }, m.att && m.attType && m.attType.startsWith("image/") && /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "70%",
      marginBottom: 6,
      borderRadius: 18,
      overflow: "hidden",
      border: "1px solid var(--line)",
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: m.att,
    alt: "adjunto",
    style: {
      width: "100%",
      display: "block",
      maxHeight: 240,
      objectFit: "cover"
    }
  }), m.attCount && m.attCount > 1 && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 8,
      right: 8,
      background: "rgba(0,0,0,0.75)",
      color: "#fff",
      padding: "4px 10px",
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 700,
      backdropFilter: "blur(4px)"
    }
  }, "+", m.attCount - 1, " m\xE1s")), m.att && m.attType && !m.attType.startsWith("image/") && /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "70%",
      marginBottom: 6,
      padding: "10px 14px",
      background: "var(--primary-soft)",
      border: "1px solid var(--line)",
      borderRadius: 14,
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 24
    }
  }, m.attType === "application/pdf" ? "📄" : "📎"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--ink)",
      fontWeight: 600
    }
  }, m.att, m.attCount && m.attCount > 1 ? ` (+${m.attCount - 1} más)` : "")), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "86%",
      background: m.r === "u" ? "linear-gradient(135deg,var(--primary),var(--primary-deep))" : "var(--bg-elev)",
      border: m.r === "u" ? "none" : "1px solid var(--line)",
      borderRadius: m.r === "u" ? "22px 22px 4px 22px" : "22px 22px 22px 4px",
      padding: "12px 16px",
      fontSize: 14,
      lineHeight: 1.6,
      color: m.r === "u" ? "#fff" : "var(--ink)",
      whiteSpace: "pre-wrap",
      boxShadow: m.r === "u" ? "0 6px 16px -6px rgba(8,145,178,0.4)" : "0 2px 6px -2px rgba(0,0,0,0.05)"
    }
  }, m.t))), cL && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--bg-elev)",
      border: "1px solid var(--line)",
      borderRadius: "22px 22px 22px 4px",
      padding: "12px 16px"
    }
  }, /*#__PURE__*/React.createElement(Dots, null))), /*#__PURE__*/React.createElement("div", {
    ref: cEnd
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "4px 20px",
      maxWidth: 640,
      width: "100%",
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      overflowX: "auto",
      scrollbarWidth: "none",
      paddingBottom: 8
    }
  }, ["Cómo voy hoy?", "Qué me falta?", "Por qué no bajo?", "Más ejercicio?", "Más proteína?"].map(s => /*#__PURE__*/React.createElement("div", {
    key: s,
    onClick: () => setCin(s),
    style: {
      background: "var(--primary-soft)",
      border: "1px solid var(--line)",
      borderRadius: 20,
      padding: "6px 14px",
      fontSize: 12,
      color: "var(--primary-deep)",
      cursor: "pointer",
      fontWeight: 600,
      whiteSpace: "nowrap"
    }
  }, s)))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 20px 24px",
      maxWidth: 640,
      width: "100%",
      margin: "0 auto",
      borderTop: "1px solid var(--line)",
      background: "var(--bg)"
    }
  }, chatAttachments.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "fade",
    style: {
      marginBottom: 10,
      padding: "10px 12px",
      background: "var(--primary-soft)",
      border: "1px solid var(--line)",
      borderRadius: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--primary-deep)",
      fontWeight: 700
    }
  }, chatAttachments.length, " ", chatAttachments.length === 1 ? "archivo" : "archivos", " listos"), chatAttachments.length > 1 && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: clearChatAttachment,
    style: {
      background: "transparent",
      border: "none",
      fontSize: 11,
      color: "var(--ink-mute)",
      cursor: "pointer",
      fontWeight: 600,
      textDecoration: "underline"
    }
  }, "quitar todos")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      overflowX: "auto",
      paddingBottom: 4
    }
  }, chatAttachments.map(att => /*#__PURE__*/React.createElement("div", {
    key: att.id,
    style: {
      position: "relative",
      flexShrink: 0
    }
  }, att.mediaType.startsWith("image/") ? /*#__PURE__*/React.createElement("img", {
    src: att.preview,
    alt: "",
    style: {
      width: 64,
      height: 64,
      objectFit: "cover",
      borderRadius: 10,
      border: "1.5px solid var(--line)"
    }
  }) : /*#__PURE__*/React.createElement("div", {
    title: att.fileName,
    style: {
      width: 64,
      height: 64,
      background: "var(--bg-elev)",
      borderRadius: 10,
      border: "1.5px solid var(--line)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      padding: 4,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 22
    }
  }, att.mediaType === "application/pdf" ? "📄" : att.isText ? "📝" : "📎"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 8,
      color: "var(--ink-mute)",
      fontWeight: 600,
      textAlign: "center",
      lineHeight: 1.1,
      wordBreak: "break-all",
      overflow: "hidden",
      maxHeight: 18
    }
  }, (att.fileName || "").slice(0, 12))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => removeChatAttachment(att.id),
    style: {
      position: "absolute",
      top: -6,
      right: -6,
      background: "var(--ink)",
      border: "2px solid var(--bg)",
      borderRadius: "50%",
      width: 22,
      height: 22,
      color: "#fff",
      fontSize: 13,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
      WebkitTapHighlightColor: "transparent",
      fontWeight: 700
    }
  }, "\xD7"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "flex-end"
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setShowAttachMenu(true),
    style: {
      background: "var(--bg-sunken)",
      border: "1.5px solid var(--line)",
      borderRadius: 18,
      padding: "13px 14px",
      color: "var(--primary)",
      fontSize: 20,
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent",
      touchAction: "manipulation",
      flexShrink: 0
    }
  }, "+"), /*#__PURE__*/React.createElement("textarea", {
    rows: 1,
    value: cin,
    onChange: e => setCin(e.target.value),
    onKeyDown: e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChat();
      }
    },
    placeholder: chatAttachments.length > 0 ? "Mensaje opcional…" : "Pregunta lo que quieras…",
    style: {
      ...inp,
      flex: 1,
      padding: "13px 16px",
      borderRadius: 18
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: sendChat,
    disabled: !cin.trim() && chatAttachments.length === 0 || cL,
    style: {
      background: !cin.trim() && chatAttachments.length === 0 || cL ? "var(--bg-sunken)" : "linear-gradient(135deg,var(--primary),var(--mint))",
      border: "none",
      borderRadius: 18,
      padding: "13px 20px",
      color: !cin.trim() && chatAttachments.length === 0 || cL ? "var(--ink-mute)" : "#fff",
      fontSize: 18,
      cursor: !cin.trim() && chatAttachments.length === 0 || cL ? "not-allowed" : "pointer",
      minWidth: 54,
      boxShadow: !cin.trim() && chatAttachments.length === 0 || cL ? "none" : "0 6px 16px -6px rgba(8,145,178,0.4)"
    }
  }, "\u2191")))), /*#__PURE__*/React.createElement("input", {
    ref: chatCameraRef,
    type: "file",
    accept: "image/*",
    capture: "environment",
    multiple: true,
    onChange: handleChatAttachment,
    style: {
      display: "none"
    }
  }), /*#__PURE__*/React.createElement("input", {
    ref: chatPhotoRef,
    type: "file",
    accept: "image/*",
    multiple: true,
    onChange: handleChatAttachment,
    style: {
      display: "none"
    }
  }), /*#__PURE__*/React.createElement("input", {
    ref: chatFileRef,
    type: "file",
    accept: "*/*",
    multiple: true,
    onChange: handleChatAttachment,
    style: {
      display: "none"
    }
  }), /*#__PURE__*/React.createElement("input", {
    ref: chatAnyFileRef,
    type: "file",
    accept: "image/*,application/pdf,.doc,.docx,.txt,.csv,.xls,.xlsx",
    multiple: true,
    onChange: handleChatAttachment,
    style: {
      display: "none"
    }
  }), showAttachMenu && /*#__PURE__*/React.createElement("div", {
    className: "fadeIn",
    onClick: () => setShowAttachMenu(false),
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(10,31,28,0.4)",
      backdropFilter: "blur(8px)",
      zIndex: 300,
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "fade",
    onClick: e => e.stopPropagation(),
    style: {
      width: "100%",
      maxWidth: 560,
      background: "var(--bg-elev)",
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      padding: "20px 20px 32px",
      boxShadow: "0 -10px 40px -10px rgba(0,0,0,0.15)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 42,
      height: 5,
      background: "var(--line-strong)",
      borderRadius: 4,
      margin: "0 auto 20px"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 24,
      color: "var(--ink)",
      lineHeight: 1,
      marginBottom: 18,
      textAlign: "center"
    }
  }, "Adjuntar"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(2,1fr)",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      setShowAttachMenu(false);
      chatCameraRef.current && chatCameraRef.current.click();
    },
    style: {
      padding: "22px 12px",
      borderRadius: 18,
      border: "1.5px solid var(--line)",
      background: "var(--bg-elev)",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10,
      WebkitTapHighlightColor: "transparent",
      touchAction: "manipulation"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 48,
      height: 48,
      borderRadius: 14,
      background: "linear-gradient(135deg,var(--primary),var(--primary-deep))",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 24,
      color: "#fff",
      boxShadow: "0 4px 12px -4px rgba(8,145,178,0.4)"
    }
  }, "\uD83D\uDCF7"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--ink)",
      fontWeight: 700
    }
  }, "C\xE1mara"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      textAlign: "center",
      lineHeight: 1.4
    }
  }, "Tomar foto ahora")), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      setShowAttachMenu(false);
      chatPhotoRef.current && chatPhotoRef.current.click();
    },
    style: {
      padding: "22px 12px",
      borderRadius: 18,
      border: "1.5px solid var(--line)",
      background: "var(--bg-elev)",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10,
      WebkitTapHighlightColor: "transparent",
      touchAction: "manipulation"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 48,
      height: 48,
      borderRadius: 14,
      background: "linear-gradient(135deg,var(--mint),var(--mint-deep))",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 24,
      color: "#fff",
      boxShadow: "0 4px 12px -4px rgba(16,185,129,0.4)"
    }
  }, "\uD83D\uDDBC\uFE0F"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--ink)",
      fontWeight: 700
    }
  }, "Galer\xEDa"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      textAlign: "center",
      lineHeight: 1.4
    }
  }, "Foto guardada")), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      setShowAttachMenu(false);
      chatFileRef.current && chatFileRef.current.click();
    },
    style: {
      padding: "22px 12px",
      borderRadius: 18,
      border: "1.5px solid var(--line)",
      background: "var(--bg-elev)",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10,
      WebkitTapHighlightColor: "transparent",
      touchAction: "manipulation"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 48,
      height: 48,
      borderRadius: 14,
      background: "linear-gradient(135deg,#ef4444,#dc2626)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 24,
      color: "#fff",
      boxShadow: "0 4px 12px -4px rgba(239,68,68,0.4)"
    }
  }, "\uD83D\uDCC4"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--ink)",
      fontWeight: 700
    }
  }, "Archivo"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      textAlign: "center",
      lineHeight: 1.4
    }
  }, "Documento")), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      setShowAttachMenu(false);
      chatAnyFileRef.current && chatAnyFileRef.current.click();
    },
    style: {
      padding: "22px 12px",
      borderRadius: 18,
      border: "1.5px solid var(--line)",
      background: "var(--bg-elev)",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10,
      WebkitTapHighlightColor: "transparent",
      touchAction: "manipulation"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 48,
      height: 48,
      borderRadius: 14,
      background: "linear-gradient(135deg,#a78bfa,#7c3aed)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 24,
      color: "#fff",
      boxShadow: "0 4px 12px -4px rgba(167,139,250,0.4)"
    }
  }, "\uD83D\uDCCE"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--ink)",
      fontWeight: 700
    }
  }, "Archivos"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      textAlign: "center",
      lineHeight: 1.4
    }
  }, "Cualquier archivo"))))), macroDetail && (() => {
    const advice = getMacroAdvice(macroDetail.key, macroDetail.current, macroDetail.target, macroDetail.isLimit);
    const diff = macroDetail.target - macroDetail.current;
    const pct = macroDetail.target > 0 ? Math.round(macroDetail.current / macroDetail.target * 100) : 0;
    return /*#__PURE__*/React.createElement("div", {
      className: "fadeIn",
      onClick: () => setMacroDetail(null),
      style: {
        position: "fixed",
        inset: 0,
        background: "rgba(10,31,28,0.5)",
        backdropFilter: "blur(8px)",
        zIndex: 300,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "fade",
      onClick: e => e.stopPropagation(),
      style: {
        width: "100%",
        maxWidth: 560,
        background: "var(--bg-elev)",
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
        maxHeight: "85vh",
        overflowY: "auto",
        boxShadow: "0 -10px 40px -10px rgba(0,0,0,0.15)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 42,
        height: 5,
        background: "var(--line-strong)",
        borderRadius: 4,
        margin: "0 auto 22px"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 14,
        marginBottom: 18
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 60,
        height: 60,
        borderRadius: 18,
        background: "var(--bg-sunken)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 32
      }
    }, macroDetail.icon), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "serif",
      style: {
        fontSize: 26,
        color: "var(--ink)",
        lineHeight: 1
      }
    }, macroDetail.label), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: advice.color,
        marginTop: 4,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.5
      }
    }, advice.title)), /*#__PURE__*/React.createElement("button", {
      onClick: () => setMacroDetail(null),
      style: {
        background: "var(--bg-sunken)",
        border: "none",
        borderRadius: "50%",
        width: 36,
        height: 36,
        color: "var(--ink-soft)",
        fontSize: 20,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }
    }, "\xD7")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 10,
        marginBottom: 18
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        padding: "14px 16px",
        background: "var(--bg-sunken)",
        borderRadius: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: "var(--ink-mute)",
        letterSpacing: 1,
        fontWeight: 700,
        textTransform: "uppercase"
      }
    }, "Llevas"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 22,
        color: "var(--ink)",
        fontWeight: 800,
        marginTop: 4,
        lineHeight: 1
      }
    }, Math.round(macroDetail.current), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        color: "var(--ink-mute)",
        fontWeight: 600
      }
    }, macroDetail.unit))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        padding: "14px 16px",
        background: "var(--bg-sunken)",
        borderRadius: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: "var(--ink-mute)",
        letterSpacing: 1,
        fontWeight: 700,
        textTransform: "uppercase"
      }
    }, macroDetail.isLimit ? "Límite" : "Meta"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 22,
        color: "var(--ink)",
        fontWeight: 800,
        marginTop: 4,
        lineHeight: 1
      }
    }, macroDetail.target, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        color: "var(--ink-mute)",
        fontWeight: 600
      }
    }, macroDetail.unit))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        padding: "14px 16px",
        background: "var(--bg-sunken)",
        borderRadius: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: "var(--ink-mute)",
        letterSpacing: 1,
        fontWeight: 700,
        textTransform: "uppercase"
      }
    }, diff >= 0 ? "Faltan" : "Pasaste"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 22,
        color: diff >= 0 ? "var(--ink)" : "var(--danger)",
        fontWeight: 800,
        marginTop: 4,
        lineHeight: 1
      }
    }, Math.abs(Math.round(diff)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        color: "var(--ink-mute)",
        fontWeight: 600
      }
    }, macroDetail.unit)))), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 8,
        background: "var(--bg-sunken)",
        borderRadius: 6,
        overflow: "hidden",
        marginBottom: 6
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: "100%",
        width: Math.min(100, pct) + "%",
        background: advice.color,
        borderRadius: 6,
        transition: "width 1s cubic-bezier(0.16,1,0.3,1)"
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "var(--ink-mute)",
        fontWeight: 600,
        textAlign: "right",
        marginBottom: 18
      }
    }, pct, "% ", macroDetail.isLimit ? "del límite" : "de tu meta"), (() => {
      const contributors = [];
      todayEntries.forEach(entry => {
        if (entry.items && entry.items.length > 0) {
          entry.items.forEach(item => {
            const val = item[macroDetail.key] || 0;
            if (val > 0) {
              contributors.push({
                name: item.name,
                portion: item.portion,
                value: val,
                meal: entry.meal
              });
            }
          });
        } else if (entry.totals && entry.totals[macroDetail.key]) {
          contributors.push({
            name: entry.originalText || "Comida",
            portion: "",
            value: entry.totals[macroDetail.key],
            meal: entry.meal
          });
        }
      });
      contributors.sort((a, b) => b.value - a.value);
      if (contributors.length === 0) {
        return /*#__PURE__*/React.createElement("div", {
          style: {
            padding: "20px 18px",
            background: "var(--bg-sunken)",
            borderRadius: 16,
            marginBottom: 14,
            textAlign: "center"
          }
        }, /*#__PURE__*/React.createElement("div", {
          style: {
            fontSize: 32,
            marginBottom: 8
          }
        }, "\uD83C\uDF7D\uFE0F"), /*#__PURE__*/React.createElement("div", {
          style: {
            fontSize: 13,
            color: "var(--ink-mute)",
            fontWeight: 600
          }
        }, "A\xFAn no has registrado ninguna comida que aporte ", macroDetail.label.toLowerCase(), " hoy"));
      }
      return /*#__PURE__*/React.createElement("div", {
        style: {
          marginBottom: 14
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11,
          color: "var(--ink-mute)",
          letterSpacing: 1.5,
          fontWeight: 700,
          textTransform: "uppercase",
          marginBottom: 10
        }
      }, "\uD83D\uDCCB De d\xF3nde viene"), /*#__PURE__*/React.createElement("div", {
        style: {
          background: "var(--bg-sunken)",
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid var(--line)"
        }
      }, contributors.slice(0, 8).map((c, i) => {
        const pctOfTotal = macroDetail.current > 0 ? Math.round(c.value / macroDetail.current * 100) : 0;
        return /*#__PURE__*/React.createElement("div", {
          key: i,
          style: {
            padding: "12px 14px",
            borderBottom: i < Math.min(contributors.length, 8) - 1 ? "1px solid var(--line)" : "none",
            display: "flex",
            alignItems: "center",
            gap: 10
          }
        }, /*#__PURE__*/React.createElement("div", {
          style: {
            width: 32,
            height: 32,
            borderRadius: 10,
            background: "var(--bg-elev)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            flexShrink: 0
          }
        }, getFoodEmoji(c.name)), /*#__PURE__*/React.createElement("div", {
          style: {
            flex: 1,
            minWidth: 0
          }
        }, /*#__PURE__*/React.createElement("div", {
          style: {
            fontSize: 13,
            color: "var(--ink)",
            fontWeight: 600,
            lineHeight: 1.3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }
        }, c.name), /*#__PURE__*/React.createElement("div", {
          style: {
            fontSize: 11,
            color: "var(--ink-mute)",
            marginTop: 2,
            fontWeight: 500
          }
        }, c.meal, c.portion ? " · " + c.portion : "")), /*#__PURE__*/React.createElement("div", {
          style: {
            textAlign: "right",
            flexShrink: 0
          }
        }, /*#__PURE__*/React.createElement("div", {
          style: {
            fontSize: 14,
            color: "var(--ink)",
            fontWeight: 800,
            lineHeight: 1
          }
        }, Math.round(c.value), /*#__PURE__*/React.createElement("span", {
          style: {
            fontSize: 10,
            color: "var(--ink-mute)",
            fontWeight: 600
          }
        }, macroDetail.unit)), /*#__PURE__*/React.createElement("div", {
          style: {
            fontSize: 10,
            color: "var(--ink-mute)",
            fontWeight: 600,
            marginTop: 2
          }
        }, pctOfTotal, "%")));
      }), contributors.length > 8 && /*#__PURE__*/React.createElement("div", {
        style: {
          padding: "10px 14px",
          fontSize: 11,
          color: "var(--ink-mute)",
          fontWeight: 600,
          textAlign: "center",
          borderTop: "1px solid var(--line)"
        }
      }, "+", contributors.length - 8, " alimentos m\xE1s")));
    })(), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "16px 18px",
        background: "linear-gradient(135deg,rgba(8,145,178,0.06),rgba(16,185,129,0.04))",
        border: "1px solid var(--line)",
        borderRadius: 16,
        marginBottom: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "var(--ink-mute)",
        letterSpacing: 1.5,
        fontWeight: 700,
        textTransform: "uppercase",
        marginBottom: 8
      }
    }, "\uD83D\uDCA1 Recomendaci\xF3n"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 14,
        color: "var(--ink)",
        lineHeight: 1.6
      }
    }, advice.text)), /*#__PURE__*/React.createElement("button", {
      onClick: () => setMacroDetail(null),
      style: {
        width: "100%",
        padding: 16,
        background: "linear-gradient(135deg,var(--primary),var(--mint))",
        border: "none",
        borderRadius: 16,
        color: "#fff",
        fontSize: 15,
        fontWeight: 700,
        cursor: "pointer",
        letterSpacing: 0.3,
        boxShadow: "0 8px 24px -8px rgba(8,145,178,0.4)",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation"
      }
    }, "\u2190 Volver")));
  })(), showReport && /*#__PURE__*/React.createElement("div", {
    className: "fadeIn",
    onClick: () => setShowReport(false),
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(10,31,28,0.5)",
      backdropFilter: "blur(8px)",
      zIndex: 300,
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "fade",
    onClick: e => e.stopPropagation(),
    style: {
      width: "100%",
      maxWidth: 560,
      background: "var(--bg-elev)",
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      padding: 24,
      maxHeight: "92vh",
      overflowY: "auto",
      boxShadow: "0 -10px 40px -10px rgba(0,0,0,0.15)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 42,
      height: 5,
      background: "var(--line-strong)",
      borderRadius: 4,
      margin: "0 auto 22px"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 30,
      color: "var(--ink)",
      lineHeight: 1
    }
  }, "Tu reporte"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--ink-mute)",
      marginTop: 4,
      fontWeight: 500
    }
  }, "\xDAltimos 7 d\xEDas")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: generateWeeklyReport,
    disabled: generatingReport,
    style: {
      background: "var(--bg-sunken)",
      border: "1px solid var(--line)",
      borderRadius: 10,
      padding: "6px 12px",
      color: "var(--primary)",
      fontSize: 11,
      fontWeight: 700,
      cursor: generatingReport ? "wait" : "pointer",
      letterSpacing: 0.3
    }
  }, generatingReport ? "..." : "↻ Actualizar"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowReport(false),
    style: {
      background: "var(--bg-sunken)",
      border: "none",
      borderRadius: "50%",
      width: 36,
      height: 36,
      color: "var(--ink-soft)",
      fontSize: 20,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, "\xD7"))), generatingReport ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "40px 20px",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement(Dots, null), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--ink-mute)",
      marginTop: 14,
      fontWeight: 600
    }
  }, "Analizando tu semana\u2026"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--ink-mute)",
      marginTop: 6
    }
  }, "Esto toma 5-10 segundos")) : weeklyReport ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: "12px 14px",
      background: "var(--mint-soft)",
      borderRadius: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--mint-deep)",
      letterSpacing: 1,
      fontWeight: 700,
      textTransform: "uppercase"
    }
  }, "Cambio peso"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      color: "var(--mint-deep)",
      fontWeight: 800,
      marginTop: 3
    }
  }, weeklyReport.weightChange >= 0 ? "+" : "", weeklyReport.weightChange, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 600
    }
  }, "kg"))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: "12px 14px",
      background: "var(--primary-soft)",
      borderRadius: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--primary-deep)",
      letterSpacing: 1,
      fontWeight: 700,
      textTransform: "uppercase"
    }
  }, "D\xEDas tracked"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      color: "var(--primary-deep)",
      fontWeight: 800,
      marginTop: 3
    }
  }, weeklyReport.daysAnalyzed, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 600
    }
  }, "/7")))), (() => {
    // Parse the report into sections by emoji headers
    const sectionConfig = [{
      emoji: "📊",
      key: "resumen",
      title: "Resumen",
      color: "var(--primary)",
      bg: "rgba(8,145,178,0.06)",
      border: "rgba(8,145,178,0.15)"
    }, {
      emoji: "⚖️",
      key: "progreso",
      title: "Progreso",
      color: "var(--mint-deep)",
      bg: "rgba(16,185,129,0.06)",
      border: "rgba(16,185,129,0.15)"
    }, {
      emoji: "🎯",
      key: "macros",
      title: "Macros",
      color: "#f59e0b",
      bg: "rgba(245,158,11,0.06)",
      border: "rgba(245,158,11,0.18)"
    }, {
      emoji: "📅",
      key: "patrones",
      title: "Patrones",
      color: "#a78bfa",
      bg: "rgba(167,139,250,0.06)",
      border: "rgba(167,139,250,0.18)"
    }, {
      emoji: "💡",
      key: "plan",
      title: "Plan",
      color: "var(--mint-deep)",
      bg: "linear-gradient(135deg,rgba(8,145,178,0.08),rgba(16,185,129,0.06))",
      border: "rgba(16,185,129,0.2)"
    }];
    const text = weeklyReport.content || "";
    const sections = [];
    let currentSection = null;
    const lines = text.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let foundSection = null;
      for (const cfg of sectionConfig) {
        if (trimmed.startsWith(cfg.emoji) || trimmed.includes(cfg.title.toUpperCase())) {
          foundSection = cfg;
          break;
        }
      }
      if (foundSection) {
        if (currentSection) sections.push(currentSection);
        currentSection = {
          ...foundSection,
          items: []
        };
      } else if (currentSection) {
        // Clean up bullet markers
        const clean = trimmed.replace(/^[-•*]\s*/, "").trim();
        if (clean) currentSection.items.push(clean);
      }
    }
    if (currentSection) sections.push(currentSection);

    // Fallback if no sections found
    if (sections.length === 0) {
      return /*#__PURE__*/React.createElement("div", {
        style: {
          background: "var(--bg-sunken)",
          borderRadius: 16,
          padding: 20,
          fontSize: 14,
          lineHeight: 1.7,
          color: "var(--ink)",
          whiteSpace: "pre-wrap"
        }
      }, text);
    }
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 14
      }
    }, sections.map((s, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        background: s.bg,
        border: "1px solid " + s.border,
        borderRadius: 18,
        padding: "18px 20px",
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 36,
        height: 36,
        borderRadius: 11,
        background: "var(--bg-elev)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 18,
        boxShadow: "0 2px 6px rgba(0,0,0,0.04)"
      }
    }, s.emoji), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 15,
        color: s.color,
        fontWeight: 800,
        letterSpacing: 0.3,
        textTransform: "uppercase"
      }
    }, s.title)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 8
      }
    }, s.items.map((item, j) => {
      // Detect if it's a key:value line (e.g., "Calorías: 1850")
      const colonIdx = item.indexOf(":");
      if (colonIdx > 0 && colonIdx < 35) {
        const key = item.substring(0, colonIdx).trim();
        const val = item.substring(colonIdx + 1).trim();
        return /*#__PURE__*/React.createElement("div", {
          key: j,
          style: {
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "6px 0"
          }
        }, /*#__PURE__*/React.createElement("div", {
          style: {
            flex: "0 0 auto",
            fontSize: 13,
            color: "var(--ink-mute)",
            fontWeight: 600,
            minWidth: 90
          }
        }, key), /*#__PURE__*/React.createElement("div", {
          style: {
            flex: 1,
            fontSize: 14,
            color: "var(--ink)",
            fontWeight: 600,
            lineHeight: 1.5
          }
        }, val));
      }
      // Numbered or bulleted item
      const isBullet = /^\d+[.)]\s/.test(item) || s.key === "plan";
      return /*#__PURE__*/React.createElement("div", {
        key: j,
        style: {
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "4px 0"
        }
      }, isBullet && /*#__PURE__*/React.createElement("div", {
        style: {
          flex: "0 0 auto",
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: s.color,
          color: "#fff",
          fontSize: 11,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1
        }
      }, j + 1), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1,
          fontSize: 14,
          color: "var(--ink)",
          lineHeight: 1.55,
          fontWeight: isBullet ? 600 : 500
        }
      }, item.replace(/^\d+[.)]\s*/, "")));
    })))));
  })(), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--ink-mute)",
      textAlign: "center",
      marginTop: 14,
      fontWeight: 500
    }
  }, "Generado ", new Date(weeklyReport.timestamp).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }))) : null)), tab === "today" && /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowFoodModal(true),
    className: "tap-effect",
    style: {
      position: "fixed",
      bottom: 24,
      right: 24,
      width: 60,
      height: 60,
      borderRadius: 30,
      background: "linear-gradient(135deg,var(--mint),var(--primary))",
      border: "none",
      color: "#fff",
      fontSize: 32,
      fontWeight: 300,
      cursor: "pointer",
      boxShadow: "0 16px 40px -8px rgba(8,145,178,0.4),0 4px 8px rgba(0,0,0,0.08)",
      zIndex: 40,
      lineHeight: 1,
      paddingBottom: 6
    }
  }, "+"));
}

// Global error catcher - shows ANY error as visible banner (debug mode)
window.addEventListener("error", e => {
  try {
    const banner = document.createElement("div");
    banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:#dc2626;color:#fff;padding:16px;font-family:system-ui;font-size:13px;line-height:1.5;border-bottom:3px solid #991b1b;max-height:60vh;overflow:auto;";
    banner.innerHTML = '<strong>⚠️ Error en Vita:</strong><br/>' + '<div style="margin-top:8px;font-family:monospace;font-size:11px;background:rgba(0,0,0,0.2);padding:8px;border-radius:6px;word-break:break-word;">' + (e.message || "Error desconocido").replace(/[<>&]/g, c => ({
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;'
    })[c]) + '<br/>' + 'Archivo: ' + ((e.filename || "?") + "").split("/").slice(-1)[0] + '<br/>' + 'Línea: ' + (e.lineno || "?") + ':' + (e.colno || "?") + '</div>' + '<button onclick="this.parentElement.remove()" style="margin-top:10px;padding:8px 14px;background:#fff;color:#dc2626;border:none;border-radius:6px;font-weight:700;cursor:pointer;">Cerrar</button>';
    document.body.insertBefore(banner, document.body.firstChild);
  } catch (err) {}
});
window.addEventListener("unhandledrejection", e => {
  try {
    const banner = document.createElement("div");
    banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:#ea580c;color:#fff;padding:16px;font-family:system-ui;font-size:13px;line-height:1.5;border-bottom:3px solid #c2410c;max-height:60vh;overflow:auto;";
    banner.innerHTML = '<strong>⚠️ Promesa rechazada:</strong><br/>' + '<div style="margin-top:8px;font-family:monospace;font-size:11px;background:rgba(0,0,0,0.2);padding:8px;border-radius:6px;word-break:break-word;">' + String(e.reason?.message || e.reason || "Sin detalle").replace(/[<>&]/g, c => ({
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;'
    })[c]) + '</div>' + '<button onclick="this.parentElement.remove()" style="margin-top:10px;padding:8px 14px;background:#fff;color:#ea580c;border:none;border-radius:6px;font-weight:700;cursor:pointer;">Cerrar</button>';
    document.body.insertBefore(banner, document.body.firstChild);
  } catch (err) {}
});
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null
    };
  }
  static getDerivedStateFromError(error) {
    return {
      error
    };
  }
  componentDidCatch(error, info) {
    console.error("Error en Vita:", error, info);
  }
  render() {
    if (this.state.error) {
      const errorMsg = String(this.state.error?.message || this.state.error || "Error desconocido");
      const stack = String(this.state.error?.stack || "").split("\n").slice(0, 8).join("\n");
      return React.createElement("div", {
        style: {
          padding: 24,
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#0a1f1c",
          lineHeight: 1.6,
          minHeight: "100vh",
          background: "#fafdfc"
        }
      }, React.createElement("h2", {
        style: {
          color: "#dc2626",
          marginBottom: 12
        }
      }, "⚠️ Algo falló en Vita"), React.createElement("div", {
        style: {
          fontSize: 13,
          color: "#64748b",
          marginBottom: 8
        }
      }, "Error:"), React.createElement("pre", {
        style: {
          background: "#fef2f2",
          padding: 12,
          borderRadius: 8,
          fontSize: 12,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          border: "1px solid #fecaca",
          color: "#991b1b",
          wordBreak: "break-word"
        }
      }, errorMsg), React.createElement("details", {
        style: {
          marginTop: 12,
          fontSize: 11
        }
      }, React.createElement("summary", {
        style: {
          cursor: "pointer",
          color: "#64748b"
        }
      }, "Ver detalles técnicos"), React.createElement("pre", {
        style: {
          background: "#f5f5f5",
          padding: 8,
          borderRadius: 6,
          fontSize: 10,
          overflow: "auto",
          marginTop: 8,
          wordBreak: "break-word",
          whiteSpace: "pre-wrap"
        }
      }, stack)), React.createElement("p", {
        style: {
          fontSize: 13,
          marginTop: 16,
          color: "#475569"
        }
      }, "Mándale screenshot a Armando."), React.createElement("div", {
        style: {
          display: "flex",
          gap: 10,
          marginTop: 20,
          flexWrap: "wrap"
        }
      }, React.createElement("button", {
        onClick: () => window.location.reload(),
        style: {
          padding: "12px 20px",
          background: "#0891b2",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer"
        }
      }, "Recargar"), React.createElement("button", {
        onClick: () => {
          try {
            const keys = ["mc_profile", "mc_log", "mc_plans", "mc_water_log", "mc_weight_history", "mc_coach_memory", "mc_weekly_report", "mc_daily_menu"];
            if (confirm("¿Reiniciar app y borrar datos locales?")) {
              keys.forEach(k => {
                try {
                  localStorage.removeItem(k);
                } catch (e) {}
              });
              window.location.reload();
            }
          } catch (e) {}
        },
        style: {
          padding: "12px 20px",
          background: "#fee2e2",
          color: "#991b1b",
          border: "1px solid #fecaca",
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer"
        }
      }, "Reiniciar app")));
    }
    return this.props.children;
  }
}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(ErrorBoundary, null, React.createElement(App)));