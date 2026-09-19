# SingleStepTests/m68000 test vectors

The test vectors in `tests/fixtures/m68000-v1.json` are a deterministic subset
of the public `SingleStepTests/m68000` corpus:

- Upstream: <https://github.com/SingleStepTests/m68000>
- Commit: `64b253116a3de04aaac4346c43680960dc9b67e5`
- License: MIT; see [`LICENSE`](LICENSE)
- Selection: eight cases without the trace bit or address-error bus transactions
  from each source listed below; `ABCD` correction edge cases and `BTST` dynamic
  immediate-EA cases retain the regression coverage they introduced

| Upstream file | SHA-256 |
| --- | --- |
| `v1/NOP.json.bin` | `9cebf91f85b38304e2496c87613621cbb983d0274a083295492ca25e2331c2b2` |
| `v1/MOVE.q.json.bin` | `bfbe824891e79b72b7163cf40f2c338a40ce50510926cee2981ecc55fb687c13` |
| `v1/ADD.b.json.bin` | `3d76bf7b85fc237be7ef2015445e91490677443d2bd4d6e6d84886989322cae5` |
| `v1/Bcc.json.bin` | `1f3df93507e9be800d8cced3d7f9f59d2b562e3f23b46badc23b5bb459383ed9` |
| `v1/CLR.w.json.bin` | `e7ac8f9efb9c71f88bc3930844e5b2f27eb61635761ab9a36ada767185acdd7a` |
| `v1/ABCD.json.bin` | `8d84455744247f93c3127efdd13ec706296dc9e85b8bd66ef04b60a2c5a14a1d` |
| `v1/BTST.json.bin` | `085509a4341a447a3b9c83ffd73bda15402ddb409e30e875e507a290ac32b074` |

After checking out that commit, the exact fixture can be regenerated with:

```sh
node scripts/build-m68000-fixture.mjs /path/to/m68000/v1 tests/fixtures/m68000-v1.json
```

The repository stores only this compact subset. The full upstream corpus is not
redistributed here, but `scripts/run-m68000-conformance.mjs` accepts its original
`.json.bin` files directly.
