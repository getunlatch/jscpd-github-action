# Check code duplicates github action

This action annotates pull requests with one notice for every modified chunk that seems to contain duplicated code.

The code duplications are made with [jscpd](https://github.com/kucherenko/jscpd).

You can instal `jscpd` in local and run it in your repository to find all duplicates.

You can configure ignored patterns and other options by commiting a [.jscpd.json](https://github.com/kucherenko/jscpd/tree/master/packages/jscpd#config-file) file in your repository.

## Example usage

```yaml
on: [pull_request]

jobs:
  cpd:
    runs-on: ubuntu-latest
    name: Check duplicated code
    steps:
      - name: Checkout
        uses: actions/checkout@v3
      - name: Check duplication
        uses: getunlatch/jscpd-github-action@v1
```
