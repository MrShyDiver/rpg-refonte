# Sons de l'Arène

Chaque son est généré par le navigateur tant qu'aucun fichier ne le remplace. Pour en remplacer un :

1. Dépose `<nom>.mp3` dans ce dossier.
2. Ajoute `"<nom>"` dans `liste.json`, par exemple `["coffre-ouverture", "recompense-legendaire"]`.

Un nom absent de la liste, ou un fichier illisible, garde le son généré. Tu peux n'en fournir que certains.

## Les quatorze sons

La rareté d'une carte du draft est celle de l'objet, ou celle tirée pour une carte de stat.

| Fichier | Moment | Durée visée |
|---|---|---|
| `coffre-pose.mp3` | Un coffre tombe et se pose à l'arrivée sur l'écran des récompenses (joué une fois par coffre, en rafale) | 0,5 s |
| `coffre-secousse.mp3` | Le coffre se tasse et tremble juste avant de s'ouvrir (0,4 s ; 0,8 s pour le coffre légendaire, lu un peu plus lentement) | 0,6 s |
| `coffre-ouverture.mp3` | Le couvercle saute, la lumière sort | 1,2 s |
| `recompense-medailles.mp3` | Des médailles sortent du coffre, le compteur défile | 1,5 s |
| `recompense-lootbox.mp3` | Une lootbox sort du coffre | 1,2 s |
| `recompense-legendaire.mp3` | Coffre légendaire : éclair, rayons, lootbox légendaire | 2,5 s |
| `recompense-ticket.mp3` | Un ticket d'arène sort du coffre | 1,2 s |
| `bilan.mp3` | Tous les coffres sont ouverts, le bilan apparaît | 2 s |
| `carte-commun.mp3` | Une carte commune est choisie pendant le draft (le cas le plus fréquent : très court, discret) | 0,5 s |
| `carte-normal.mp3` | Une carte normale est choisie | 0,6 s |
| `carte-rare.mp3` | Une carte rare est choisie | 0,8 s |
| `carte-epique.mp3` | Une carte épique est choisie | 1 s |
| `carte-legendaire.mp3` | Une carte légendaire est choisie (2 % des cartes : peut être spectaculaire) | 1,5 s |
| `draft-fini.mp3` | La 30e carte est choisie, le build est prêt | 1,5 s |

## Les générer avec fal.ai

Modèle : `fal-ai/elevenlabs/sound-effects/v2` (ElevenLabs Sound Effects V2 sur fal.ai). Tarif relevé le 3 oct. 2026 :
0,002 $ par seconde générée, soit quelques centimes pour les quatorze sons, même en plusieurs essais.

Réglages : `output_format` = `mp3_44100_128`, `prompt_influence` = 0,6 (0,3 par défaut : plus haut, le son colle davantage à
la consigne), `duration_seconds` = la durée visée du tableau (0,5 au minimum). Les consignes marchent mieux en anglais.

| Fichier | Consigne (`text`) |
|---|---|
| `coffre-pose` | A small heavy wooden treasure chest dropping onto a stone floor, short solid thud with a faint metallic rattle, dry and close, no reverb tail, game sound effect |
| `coffre-secousse` | A locked wooden treasure chest rattling and shaking rapidly, metal latch clattering, building tension, short, game sound effect |
| `coffre-ouverture` | A treasure chest lid bursting open: metal latch click, short wooden creak, then a bright magical whoosh of light, satisfying game reward sound effect |
| `recompense-medailles` | A shower of gold coins pouring and clinking into a pile, bright and rewarding, casual game reward sound effect |
| `recompense-lootbox` | A magical item reveal chime, sparkling shimmer with a soft rising tone, positive, game reward sound effect |
| `recompense-legendaire` | An epic legendary reward reveal: deep impact, rising choir swell and golden shimmering sparkles, triumphant, game sound effect |
| `recompense-ticket` | A paper ticket flicking out with a quick whoosh followed by a bright short bell ding, game interface sound effect |
| `bilan` | A short triumphant victory fanfare stinger, brass and bells, warm and satisfying, ends cleanly, game results screen |
| `carte-commun` | A single playing card being picked and placed, crisp paper flick with a soft tap, very short, quiet game interface sound |
| `carte-normal` | A playing card being picked and placed with a soft pleasant two-note chime, short, light game interface sound |
| `carte-rare` | A playing card being picked with a bright crystalline three-note rising chime and a light shimmer, short, game reward sound |
| `carte-epique` | A playing card being picked with a rich magical rising arpeggio and a sparkling swell, powerful but short, game reward sound |
| `carte-legendaire` | A legendary card being picked: deep impact, golden triumphant chord and shimmering sparkles, epic, short game reward sound |
| `draft-fini` | A sword being drawn from its sheath followed by a confident heroic chord, ready for battle, short game sound effect |

Conseils : coupe le silence au début de chaque fichier (le son doit partir tout de suite, l'animation est calée dessus),
et garde un volume voisin d'un fichier à l'autre. `carte-commun` et `carte-normal` s'entendent une vingtaine de fois par draft : choisis les versions les plus discrètes.
