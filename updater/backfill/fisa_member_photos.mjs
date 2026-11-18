import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const profiles = [
  ["Alexandra Leclair", "https://www.linkedin.com/in/alexandra-leclair-83089a296/", "https://media.licdn.com/dms/image/v2/D5603AQGqXo-3eQaNbA/profile-displayphoto-crop_800_800/B56aENdo5bJAAI-/0/1791227239651?e=1796860800&v=beta&t=kXvrpfMEv_Vtm7A6OqoK_yZbSjAsUUMnu5n8wfTCLLo"],
  ["Véronique Grigg", "https://www.linkedin.com/in/v%C3%A9ronique-g/", "https://media.licdn.com/dms/image/v2/D4E03AQGO1oYuuhFpQQ/profile-displayphoto-crop_800_800/B4EaGYGmpSH0AI-/0/1793553234296?e=1796860800&v=beta&t=MFRad-FmZjk7q_-N-ncsjYlw98jRipjeALIProgcKKU"],
  ["Adam Dinia", "https://www.linkedin.com/in/adamdinia/", "https://media.licdn.com/dms/image/v2/D4E03AQFt4Tev01BRug/profile-displayphoto-crop_800_800/B4EZ2Dl6lxGkAM-/0/1776029249334?e=1796860800&v=beta&t=lyK7wwi8ii7TXxZo1JPWLtXrFz85j2M5lLvpfRT1whM"],
  ["Adriana Torres", "https://www.linkedin.com/in/adriana-torres-b23a57270/", "https://media.licdn.com/dms/image/v2/D5603AQEdSZ7PbXZYcQ/profile-displayphoto-crop_800_800/B56aERBk9gHUAI-/0/1791286989526?e=1796860800&v=beta&t=V1H2mDHUDmW-gMx_47QrtRkPVA1HMm-D6L4OP6tvsOQ"],
  ["Nathan Lidstone", "https://www.linkedin.com/in/nathan-lidstone/", "https://media.licdn.com/dms/image/v2/D5603AQHheywtT1i1Pw/profile-displayphoto-crop_800_800/B56aEZeCLAIAAI-/0/1791428667349?e=1796860800&v=beta&t=qhi_QJ-nuubg_csvjtxo4tXl6UsjAGXWDsmbUvup4gg"],
  ["William Loiselle", "https://www.linkedin.com/in/williamloiselle/", "https://media.licdn.com/dms/image/v2/D4E03AQFMq9B9kLaK8Q/profile-displayphoto-crop_800_800/B4EZzae265JAAM-/0/1773192049298?e=1796860800&v=beta&t=XRIuFqKcm1eJlwN7qx98oVy9u9FJv6wo3lDMz-ZPdMw"],
  ["Sami Mabsout", "https://www.linkedin.com/in/sami-mabsout/", "https://media.licdn.com/dms/image/v2/D5603AQGzbyvwXL3lvA/profile-displayphoto-crop_800_800/B56aEOasEXGcAM-/0/1791243240317?e=1796860800&v=beta&t=no941zp5UaO8UWBu9bP6mHlnq-QkwD-oi2-N3xy0z7A"],
  ["Hanut Gera", "https://www.linkedin.com/in/hanutgera/", "https://media.licdn.com/dms/image/v2/D5603AQHxZptRekSJhg/profile-displayphoto-crop_800_800/B56aEcY3.kHkAQ-/0/1791477645905?e=1796860800&v=beta&t=VNfOEHlUQAO656wBTr7CoPUUA6Olkj_eclLtfvgC3Zk"],
  ["Samuel Rodriguez", "https://www.linkedin.com/in/samuel-rodriguez-7al/", "https://media.licdn.com/dms/image/v2/D4E03AQEehH2iT6ZKDg/profile-displayphoto-crop_800_800/B4EaGIwViXHcAI-/0/1793295737707?e=1796860800&v=beta&t=_VFWn6T6m4Xqdh1sXvfqwv0vhENXhN8y7_cxKHqHNqE"],
  ["Félix Bisson", "https://www.linkedin.com/in/f-bisson/", "https://media.licdn.com/dms/image/v2/D5603AQFGe4xJRUKQ9g/profile-displayphoto-crop_800_800/B56aEX4_npH8AQ-/0/1791402181673?e=1796860800&v=beta&t=gCn_n3vTLqF6szl2_Fa0m_1oFq2AD8rjCuGMAICsD4o"],
  ["Carmen Mehanna", "https://www.linkedin.com/in/carmen-mehanna-3b0805323/", "https://media.licdn.com/dms/image/v2/D5603AQHHi-C-SX--vg/profile-displayphoto-crop_800_800/B56aHNZRzOKUAI-/0/1794447322251?e=1796860800&v=beta&t=JKYSHTvzyyZYhvw5wsjb2BQ61c_ePtmwXtPTGbX-CL4"],
  ["Loïc Chapdelaine", "https://www.linkedin.com/in/culo%C3%AFcchapdelaine/", "https://media.licdn.com/dms/image/v2/D5603AQH000M6MyAfYg/profile-displayphoto-crop_800_800/B56Z9PCeV4HYBk-/0/1783737478895?e=1796860800&v=beta&t=CPyMK0wbBOeZE-Vc0XTMUolJdLZn24MZ87zXproBMfg"],
  ["Ariana Constantatos", "https://www.linkedin.com/in/arianaconstantatos/", "https://media.licdn.com/dms/image/v2/D4D03AQG4hOefrwFPig/profile-displayphoto-crop_800_800/B4DZpfl6NEIEAI-/0/1762540370818?e=1796860800&v=beta&t=glwnTn4kNpIb8tmekYB6TfWgFZjSOtLOXKe9tpdH2Fg"],
  ["Kayleigh Bélanger-Besner", "https://www.linkedin.com/in/kayleigh-b%C3%A9langer-besner/", "https://media.licdn.com/dms/image/v2/D4E03AQHA0OA67DnegQ/profile-displayphoto-crop_800_800/B4EZpvUXohKsAI-/0/1762804203189?e=1796860800&v=beta&t=aHn-0Dqr0nYElBKrbNlQUrINtTvrgrvxIT_QH7HdYWo"],
  ["Alec De Zottis", "https://www.linkedin.com/in/alec-de-zottis/", "https://media.licdn.com/dms/image/v2/D4E03AQGlHAmeYFYgTg/profile-displayphoto-crop_800_800/B4EZ1wpFUAJcAI-/0/1775711312076?e=1796860800&v=beta&t=vuQtyFH7RtcQrlwrA8lZrgxLZfIChh8mfQuA2xRTc0Y"],
  ["Sandrine Poulin", "https://www.linkedin.com/in/sandrinepoulin20/", "https://media.licdn.com/dms/image/v2/D4E03AQGagSPFXXtaeQ/profile-displayphoto-crop_800_800/B4EZriMwgaIoAI-/0/1764731587584?e=1796860800&v=beta&t=y76Au6P-cdDhSj3NRd1b9By8lEnG-CDZ7G3bbAKB6MY"],
  ["Sarah Wakim", "https://www.linkedin.com/in/sarah-wakim/", "https://media.licdn.com/dms/image/v2/D5603AQFjXLKLFVvluQ/profile-displayphoto-crop_800_800/B56aEYgXuNJwAI-/0/1791412501876?e=1796860800&v=beta&t=ltnmpbaqotKJtdVZPj_PJ5tBlMtENncahwaKIe3dpuE"],
  ["Daniela Chavarria", "https://www.linkedin.com/in/daniela-chavarria1/", "https://media.licdn.com/dms/image/v2/D4E03AQGbjckSy0FZAg/profile-displayphoto-crop_800_800/B4EaF1FEW8HwAI-/0/1792965626073?e=1796860800&v=beta&t=3TnCjBNQD3IeHooXEMiGFJx4827UZi64-Sg3vyK84G8"],
  ["Gabriella Gulian", "https://www.linkedin.com/in/gabriella-gulian/", "https://media.licdn.com/dms/image/v2/D5603AQG9OmxGKV4bLQ/profile-displayphoto-crop_800_800/B56aEOLzmRHYAI-/0/1791239339456?e=1796860800&v=beta&t=CVk2U3t35E7f2Pt-xAWKbRJYYiJ87gDmDHR_0OejTb4"],
  ["Félix La", "https://www.linkedin.com/in/f%C3%A9lixla/", "https://media.licdn.com/dms/image/v2/D5603AQHcOom0FNFmqg/profile-displayphoto-crop_800_800/B56aEOqHlwIMAI-/0/1791247287491?e=1796860800&v=beta&t=H7cxSp8Ywjw_Pq6o-Pyz3ov2BSac3ZWJzvsJRWEZgdk"],
  ["Nicolas Phillipe Saubier", "https://www.linkedin.com/in/nicolas-saubier/", "https://media.licdn.com/dms/image/v2/D4E03AQEJDE1GqIJpVQ/profile-displayphoto-crop_800_800/B4EZ2xQu08J0AM-/0/1776795448125?e=1796860800&v=beta&t=KKvOKqOAbRH7wHQa1cJ7flBfxeMprdg-jTEdeZvTtUw"],
  ["Helena Iranpur", "https://www.linkedin.com/in/helena-iranpur-4189092b2/", "https://media.licdn.com/dms/image/v2/D4E03AQFspaRxiAVvuQ/profile-displayphoto-crop_800_800/B4EaF7KvEcJ0AI-/0/1793067777109?e=1796860800&v=beta&t=YanwpbyzU4H7zR1V0VwOFxQ6fPFl355kTDMvzMvn2yE"],
  ["Valentino Magniette-Bosseboeuf", "https://www.linkedin.com/in/valentino-mb/", "https://media.licdn.com/dms/image/v2/D4E03AQECMF4-gxtLtQ/profile-displayphoto-shrink_800_800/profile-displayphoto-shrink_800_800/0/1732311063529?e=1796860800&v=beta&t=1FgaETNIEe2bmjIt1pRQU7o35EuymKl8SkU4n3LcEvg"],
  ["Ethan Holm", "https://www.linkedin.com/in/ethanholm/", "https://media.licdn.com/dms/image/v2/D5603AQG9x71UH82avg/profile-displayphoto-crop_800_800/B56aFpiakpKwAM-/0/1792771993953?e=1796860800&v=beta&t=5uLnauvJ2DvAdP5qxyryvDOx3Akia1We4eaJFFmFPJA"],
  ["Seth Crangle", "https://www.linkedin.com/in/seth-crangle/", "https://media.licdn.com/dms/image/v2/D5603AQH2FX_EYH8YZQ/profile-displayphoto-crop_800_800/B56aEOOpyxJcAM-/0/1791240087374?e=1796860800&v=beta&t=XLY94-K0WxFYYUCpX9iGBFJCDwZlnT8VQ8ZUhmmkBn4"],
  ["Hudson Ryer", "https://www.linkedin.com/in/hudson-ryer-aaa393302/", "https://media.licdn.com/dms/image/v2/D5603AQGjvUKf4EaQtA/profile-displayphoto-crop_800_800/B56aDgdFaAGoAI-/0/1790472116276?e=1796860800&v=beta&t=lCne3Wp_Hsz0JTQ2ND4u3IzjG0tiJEBzyju9ug8GDVE"],
];

const slug = (name) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const root = path.resolve(import.meta.dirname, "../..");
const outputDir = path.join(root, "assets/members/fisa");
await mkdir(outputDir, { recursive: true });

for (const [name, , photoUrl] of profiles) {
  const response = await fetch(photoUrl);
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) throw new Error(`${name}: ${contentType}`);
  await writeFile(path.join(outputDir, `${slug(name)}.jpg`), Buffer.from(await response.arrayBuffer()));
}

const teamsPath = path.join(root, "assets/data/teams.json");
const teams = JSON.parse(await readFile(teamsPath, "utf8"));
const fisa = teams.teams.find((team) => team.ig_handle === "fisajmsb");
if (!fisa) throw new Error("FISA roster not found");
const profileByName = new Map(profiles.map(([name, linkedin_url]) => [name, { linkedin_url, photo: `assets/members/fisa/${slug(name)}.jpg` }]));
for (const member of fisa.members) Object.assign(member, profileByName.get(member.name) || {});
await writeFile(teamsPath, `${JSON.stringify(teams, null, 2)}\n`);
console.log(`Saved ${profiles.length} FISA member photos.`);
