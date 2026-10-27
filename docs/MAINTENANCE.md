# Modifier et publier Covoiturage

Ce guide décrit l’organisation du projet. Il n’est pas nécessaire de le suivre pour utiliser l’application.

## Une application sans compilation

Les fichiers HTML, CSS et JavaScript sont directement servis par GitHub Pages. Il n’y a ni installation npm, ni serveur de données à configurer.

Pour changer un texte, commencez par `index.html`. Certains textes créés lors des interactions se trouvent dans `app.js`. L’apparence se trouve dans `styles.css`. Faites une sauvegarde de vos données avant de tester une modification importante.

Pour tester sur ordinateur avec Python installé, ouvrez un terminal dans le dossier et lancez :

```sh
python -m http.server 8000
```

Ouvrez ensuite `http://localhost:8000`. Les données de ce test sont distinctes de celles du site en ligne. L’ouverture directe de `index.html` par double-clic ne permet pas de vérifier correctement l’installation et le mode hors ligne.

## Trois références à distinguer

- **Version de l’application** : le numéro visible est désormais 2. Il se trouve dans `APP_VERSION` dans `app.js` et dans le texte initial « Version 2 » de `index.html`. La prochaine version visible sera 3.
- **Cache hors ligne** : les adresses des ressources dans `index.html`, `manifest.webmanifest` et `sw.js` utilisent `?v=2-20261027`. Le nom du cache dans `sw.js` se termine par `v2-20261027`. Changez ces références ensemble à chaque livraison, avec une valeur jamais utilisée auparavant.
- **Compatibilité des sauvegardes** : `BACKUP_VERSION = 14` et `SCHEMA_VERSION = 4` sont des références techniques conservées pour lire les sauvegardes existantes. Elles ne repartent pas de 1. Une nouvelle sauvegarde peut donc contenir `version: 14` même si l’interface affiche « Version 2 ».

Pour une modification visuelle, ne changez ni les références techniques des sauvegardes, ni les marqueurs de calcul enregistrés dans les trajets (`automatic-v4`, `per-half-v11`). Ces derniers servent à lire les anciens montants correctement. Si le format des données évolue, il faut revoir sa validation, sa compatibilité et les tests de restauration.

Conservez également la clé `covoiturageItinerairesDataV1`, l’identité du manifeste et l’adresse du site : elles permettent de retrouver les données et l’application installée.

## Vérifier une modification

Avant de publier, vérifiez les quatre onglets en clair et sombre, sur petit et grand écran. Essayez l’ajout d’un itinéraire et d’un passager, un trajet avec des participations différentes, un versement, puis l’export et la restauration d’une sauvegarde dans un environnement de test. Vérifiez également le rechargement hors ligne.

Une simulation mobile sur ordinateur ne remplace pas un essai sur iPhone pour le clavier, l’installation et les gestes tactiles.

## Publier sur GitHub Pages

1. Mettez les fichiers modifiés dans ce dépôt, en conservant `index.html` à la racine.
2. Enregistrez les modifications dans la branche **main** avec un message qui explique le changement. GitHub appelle cet enregistrement un **commit**.
3. Consultez **Actions → pages build and deployment** et attendez le résultat vert.
4. Ouvrez le site, puis vérifiez la version dans **Réglage**.

Si Pages doit être reconfiguré : **Settings → Pages → Build and deployment → Deploy from a branch → main → / (root)**. Conservez l’adresse actuelle du site.

Le dépôt étant public, n’y ajoutez pas vos sauvegardes personnelles, mots de passe ou clés d’accès. Le fichier `.gitignore` aide à exclure les sauvegardes locales lors de l’utilisation de Git ; il ne protège pas un fichier téléversé manuellement sur GitHub.

## Retrouver une ancienne version

L’historique des commits est conservé. La branche `archive/avant-version-1` garde le code de la V14 avant cette renumérotation. Pour annuler une modification, privilégiez un nouveau commit qui rétablit les fichiers souhaités, plutôt que d’effacer l’historique.

Le retour du code à une ancienne version ne restaure pas vos données personnelles : leur restauration utilise le fichier JSON sauvegardé depuis l’application.

