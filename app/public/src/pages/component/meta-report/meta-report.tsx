import React from "react"
import { Tab, Tabs, TabList, TabPanel } from "react-tabs"

import { useTranslation } from "react-i18next"
import { CompositionReport } from "./composition-report"
import { ItemReport } from "./item-report"
import { PokemonReport } from "./pokemon-report"
import "./meta-report.css"

export default function MetaReport() {
  const { t } = useTranslation()

  return (
    <div id="meta-report" className="nes-container">
      <Tabs>
        <TabList>
          <Tab key="team-comps">{t("meta_report")}</Tab>
          <Tab key="items">{t("item_report")}</Tab>
          <Tab key="pokemons">{t("pokemon_report")}</Tab>
        </TabList>

        <TabPanel key="team-comps-panel">
          <CompositionReport />
        </TabPanel>
        <TabPanel>
          <ItemReport />
        </TabPanel>
        <TabPanel>
          <PokemonReport />
        </TabPanel>
      </Tabs>
    </div>
  )
}
