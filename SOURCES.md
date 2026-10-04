# Data sources and attribution

SA Economic Pulse displays data from two public providers. Each retains its own rights, attribution
requirements and terms of use; please check them before reusing the data. The project (code) is under the
Apache License 2.0 (see [LICENSE.txt](LICENSE.txt) and [NOTICE.txt](NOTICE.txt)); that license does **not**
extend to the data.

This is an independent viewer. It is not affiliated with or endorsed by Statistics South Africa or the
South African Reserve Bank.

## Statistics South Africa (Stats SA)

Source: https://www.statssa.gov.za (publications and releases pages). Data © Statistics South Africa.
The Excel workbooks that accompany each release are parsed into `data/P*.js`; nothing is altered except
for reshaping (periods, series ids, units).

| Code | Publication | Frequency |
|---|---|---|
| P2041 | Mining: Production and sales | Monthly |
| P3041.2 | Manufacturing: Production and sales | Monthly |
| P3043 | Manufacturing: Utilisation of production capacity | Quarterly |
| P4141 | Electricity generated and available for distribution | Monthly |
| P6242.1 | Retail trade sales | Monthly |
| P6343.2 | Motor trade sales | Monthly |
| P6141.2 | Wholesale trade sales | Monthly |
| P5041.1 | Building statistics (plans passed / completed) | Monthly |
| P0151.1 | Construction materials price indices | Monthly |
| P0160 | Residential property price index | Monthly |
| P6410 | Tourist accommodation | Monthly |
| P0021 | Annual financial statistics | Annual |
| P0141 | Consumer price index (CPI) | Monthly |
| P0141AP | CPI average prices (Rand) | Monthly |
| P0142.1 | Producer price index (PPI) | Monthly |
| P7162 | Land transport survey | Monthly |
| P6420 | Food and beverages | Monthly |
| P0142.7 | Export and import unit value indices | Monthly |
| P0043.1 | Statistics of liquidations | Monthly |
| P0043.2 | Statistics of insolvencies | Monthly |
| P0041 | Statistics of civil cases for debt | Monthly |
| P0044 | Quarterly financial statistics (QFS) | Quarterly |
| P9110.1 | Quarterly financial statistics of selected municipalities (QFSSM) | Quarterly |
| P0441 | Gross domestic product (GDP), quarterly | Quarterly |
| P0441A | Gross domestic product (GDP), annual | Annual |
| P0211 | Quarterly Labour Force Survey (QLFS) | Quarterly |
| P0277 | Quarterly Employment Statistics (QES) | Quarterly |
| P0045 | Quarterly capital expenditure (QCE) | Quarterly |
| P0441.2 | Provincial gross domestic product | Annual |
| P9119.3 | Financial statistics of national government | Annual |
| P9119.4 | Financial statistics of consolidated general government | Annual |
| P9121 | Financial statistics of provincial government | Annual |
| P9102 | Financial statistics of extra-budgetary accounts and funds | Annual |
| P9103.1 | Financial statistics of higher education institutions | Annual |
| P9101 | Capital expenditure by the public sector | Annual |
| P9115 | Non-financial census of municipalities | Annual |
| P1101 | Agricultural survey | Annual |

## South African Reserve Bank (SARB)

Source: the Reserve Bank's public Web API, `https://custom.resbank.co.za/SarbWebApi` (see the endpoint
table in [README.md](README.md)); https://www.resbank.co.za. Data © South African Reserve Bank.
518 series are read: policy and market rates, bond yields, exchange rates and gold, money and credit,
bank balance sheets, the balance of payments and international investment position, reserves, trade,
national government cash flow and debt, the IMF SDDS tables (real, fiscal, financial, external sector),
the composite business-cycle indicators and the money-market desk's notices.

The Reserve Bank's Quarterly Bulletin download catalogue is not used in this project.

## Notes

* Series are shown as published; derived measures (year-on-year changes, contributions, rolling sums,
  indices rebased to 100) are computed in the page and labelled as such. They are descriptive statistics,
  not forecasts and not advice.
* Please credit the original publisher when you reuse a chart or table exported from the dashboard; the
  exported pictures carry a source line.
