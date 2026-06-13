# Récapitulatif Migration & Spécificités Métier (Mobile → Web)

Ce document synthétise les logiques clés à migrer, en mettant l'accent sur les spécificités de la page détails (RSI/SMA, Affiliation) qui diffèrent d'une simple application d'affichage.

## 1. Architecture & Connexions (Synthèse)
*   **Backend:** Supabase (`investment_options`, `asset_details`, `affiliates`).
*   **Auth:** `@supabase/supabase-js`.
*   **APIs Externes:** Fear & Greed, Altcoin Index, AlphaVantage (Finance).

## 2. Logique Cœur (Allocation & Investissement)
*   **Allocation (Risque 1-5):** Filtre `abs(diff) <= 3`, poids `5 - abs(diff)`, normalisation 100%.
*   **Distribution:** Respect du `maximum_investment` (Passe 1: théorique, Passe 2: plafonnement).
*   **APY Global:** Moyenne pondérée des rendements.

## 3. Spécificités Page Détails (CRITIQUE)

C'est ici que réside la plus grande complexité métier.

### A. Calculateur RSI / SMA (Analyse Technique)
Le mobile permet de lancer une analyse technique sur demande (bouton calculatrice) pour chaque actif.

**Flux de Données & Cache (Stratégie d'économie d'API) :**
1.  **Vérification Cache Local (AsyncStorage) :** Si données datant d'aujourd'hui (`RSI_SMA_updated_at`), affichage immédiat.
2.  **Vérification Supabase :** Si l'utilisateur n'a pas le cache mais que l'analyse a déjà été faite aujourd'hui par quelqu'un d'autre (stockée dans `asset_details`), on récupère ces valeurs.
    *   *But :* Éviter de consommer les quotas AlphaVantage inutilement.
3.  **Appel AlphaVantage (Si nécessaire) :**
    *   **RSI:** `function=RSI`, `time_period=3`, `interval=daily`.
    *   **SMA:** `function=SMA`, `time_period=5`, `interval=daily`.
4.  **Mise à jour Supabase :** Les nouvelles valeurs calculées sont sauvegardées dans `asset_details` pour servir à la communauté.

**Formules de Calcul :**
*   **RSI (Valeur):** Moyenne arithmétique des 3 derniers jours disponibles.
*   **SMA (Tendance):** Pente de la régression linéaire sur les 5 derniers jours (`slope`).
    *   `normalizedSlope = slope / smaValues[0] * 100`
    *   **> 0.5 :** Forte hausse 📈
    *   **0 à 0.5 :** Légère hausse 🟰
    *   **-0.5 à 0 :** Légère baisse 🟰
    *   **< -0.5 :** Baisse forte 📉
*   **Conclusion (Matrice Décisionnelle):**
    *   Le système génère une phrase de conclusion ("Achat fort", "Attention surchauffe", etc.) en croisant la valeur RSI et la tendance SMA.
    *   *Exemple :* Si SMA "Forte hausse" ET RSI < 35 => "Achat fort conseillé".

### B. Gestion des Affiliations
En bas de la page détails, des liens d'affiliation sont proposés (`table: affiliates`).

**Logique d'Affichage :**
*   **Filtrage :** On récupère les affiliés actifs.
*   **Tri Intelligent (Contextuel) :**
    1.  **Priorité :** Les affiliés dont le `id_invest` correspond à l'`id_invest` de l'actif consulté (Ex: Affilié "Trade Republic" affiché en premier pour un actif "Bourse").
    2.  **Reste :** Les autres affiliés suivent.
*   **UI :** 
    *   Les affiliés prioritaires ont un style mis en avant (Badge "✓ Recommandé pour cet investissement").
    *   Bouton d'action direct vers le lien (`Linking.openURL`).
*   **Disclaimer :** Texte obligatoire sur le soutien au développeur ("En passant par ces liens...").

## 4. Instructions Migration Web

1.  **Allocation :** Répliquer la logique de poids et de plafonnement (Section 2).
2.  **Page Détails (Nouveau) :**
    *   Ajouter le bouton "Lancer l'analyse" (ne pas le faire automatiquement au chargement de page).
    *   Implémenter la logique "Cache First -> Supabase First -> API" pour le RSI/SMA. **C'est crucial pour ne pas exploser les quotas API.**
    *   Ajouter la section Affiliation en bas de page avec le tri intelligent basé sur l'investissement courant.
3.  **Indicateurs Globaux :** Fear & Greed + Altcoin Index (Crawler via Supabase).
