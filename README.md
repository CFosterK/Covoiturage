# Covoiturage — Version 1

Une application pour noter vos trajets de covoiturage, calculer la participation de chaque passager et suivre les versements reçus.

**[Ouvrir l’application](https://cfosterk.github.io/Covoiturage/)**

Cette Version 1 prend pour base la version précédemment appelée V14. La numérotation repart de 1 ; les données déjà enregistrées et les calculs sont conservés.

## Commencer

1. Dans **Réglage**, ajoutez un itinéraire : sa distance et son péage correspondent à un aller simple.
2. Ajoutez vos passagers et renseignez votre véhicule, son énergie et le nombre maximum de passagers.
3. Dans **Trajet**, choisissez une date, un itinéraire et les passagers présents. Le bouton rond à côté d’un nom permet de choisir aller simple ou aller-retour.
4. Vérifiez le récapitulatif, puis touchez **Enregistrer le trajet**.
5. Dans **Versement**, consultez le solde d’un passager et enregistrez l’argent reçu.
6. Dans **Historique**, retrouvez les trajets et les versements, utilisez les filtres ou exportez un fichier CSV pour Excel.

Le conducteur effectue un aller-retour. Les participations dépendent du nombre de passagers présents sur chaque moitié du trajet. Les passagers en aller simple sont supposés voyager ensemble sur la même moitié. Les montants déjà enregistrés ne changent pas quand vous modifiez les réglages.

## Installer sur iPhone

Ouvrez le lien dans Safari, puis utilisez **Partager → Sur l’écran d’accueil** (ou **Ajouter à l’écran d’accueil**, selon votre version d’iOS). Ouvrez l’application une première fois avec une connexion Internet pour préparer son utilisation hors ligne.

## Sauvegarder vos données

Les données restent dans le navigateur de votre appareil. Elles ne sont pas synchronisées entre appareils. GitHub conserve le code de l’application, pas vos trajets ni vos versements.

Dans **Réglage → Sauvegarde des données**, utilisez **Sauvegarder mes données** et gardez le fichier, par exemple dans iCloud Drive. **Restaurer une sauvegarde** permet de le réimporter et demande confirmation avant de remplacer les données actuelles.

Les sauvegardes des précédentes versions multi-itinéraires V1 à V14 restent acceptées. Celles de l’ancienne application sans itinéraires (V37 à V58) ne sont pas compatibles. Le CSV sert à consulter les opérations ; utilisez la sauvegarde JSON pour restaurer l’application.

## À quoi servent les fichiers ?

| Fichier | Rôle |
| --- | --- |
| `index.html` | Le contenu des écrans : champs, titres et boutons. |
| `styles.css` | L’apparence : couleurs, tailles, espacements et animations. |
| `app.js` | Le fonctionnement : calculs, enregistrement, historiques et sauvegardes. |
| `sw.js` | La mise en mémoire des fichiers pour le fonctionnement hors ligne. |
| `manifest.webmanifest` | Le nom et les paramètres de l’application installée. |
| `banner.png` | La bannière en haut des écrans. |
| Les fichiers `icon*.png`, `apple-touch-icon.png`, `favicon-32.png` | Les icônes utilisées par le navigateur et l’écran d’accueil. |
| `.nojekyll` | Indique à GitHub Pages de publier les fichiers tels quels. |
| `docs/MAINTENANCE.md` | Les indications pour modifier et publier l’application. |

## Mettre l’application à jour

Le site utilise les fichiers de la branche **main**, à la racine du dépôt. Une modification de cette branche lance la publication GitHub Pages. L’onglet **Actions** de GitHub permet de suivre son résultat.

Après une mise à jour, fermez toutes les fenêtres de l’application, puis rouvrez-la avec Internet. Il peut être nécessaire de l’ouvrir une seconde fois pour activer la nouvelle version hors ligne. Évitez d’effacer les données du navigateur pour forcer une mise à jour : cela effacerait aussi les données locales de l’application.

Pour les détails, consultez le [guide de maintenance](docs/MAINTENANCE.md). L’historique GitHub conserve les versions précédentes du code.
