Notes
=====

```bash
diff <(goe --quiet 'github.com/shurcooL/go/exp/11' 'b := new(bytes.Buffer); InlineDotImports(b, "github.com/shurcooL/learn/29"); os.Stdout.Write(b.Bytes())') expected.txt
```
