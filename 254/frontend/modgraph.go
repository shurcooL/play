package main

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"syscall/js"
	"time"

	"github.com/rogpeppe/go-internal/modfile"
	"github.com/rogpeppe/go-internal/module"
)

func serveGraph(ctx context.Context, query string, sleep time.Duration, mp moduleProxy) error {
	var frontier []module.Version
	for _, q := range strings.Split(query, ",") {
		frontier = append(frontier, parseQuery(q))
	}
	type edge struct {
		From, To string // Module paths.
	}
	edges := make(map[edge]map[string]struct{}) // Edge -> set of versions.
	bad := make(map[module.Version]struct{})
	seen := make(map[module.Version]bool)
	for len(frontier) > 0 {
		mod := frontier[0]
		frontier = frontier[1:]
		fmt.Printf("finding: %s@%s (%d left...)\n", mod.Path, mod.Version, len(frontier))
		goMod, err := mp.GoMod(ctx, mod)
		if os.IsNotExist(err) {
			log.Printf("go.mod for %v not found, skipping\n", mod)
			continue
		} else if err != nil {
			return err
		}
		f, err := modfile.Parse("go.mod", goMod, nil)
		if err != nil {
			return err
		}
		if mod.Path != f.Module.Mod.Path {
			log.Printf("module %q go.mod module path mismatch: %q\n", mod.Path, f.Module.Mod.Path)
			bad[mod] = struct{}{}
			continue
		}
		for _, r := range f.Require {
			if !seen[r.Mod] {
				frontier = append(frontier, r.Mod)
				seen[r.Mod] = true
			}
			e := edge{
				From: mod.Path,
				To:   r.Mod.Path,
			}
			vs := edges[e]
			if vs == nil {
				vs = make(map[string]struct{})
			}
			vs[r.Mod.Version] = struct{}{}
			edges[e] = vs
		}
		if len(frontier) == 0 || sleep != 0 {
			var g bytes.Buffer
			g.WriteString("digraph \"\" {\n")
			for e, versions := range edges {
				var vs []string
				for v := range versions {
					vs = append(vs, v)
				}
				fmt.Fprintf(&g, "	%q -> %q [label=%q];\n", e.From, e.To, strings.Join(vs, "\n"))
			}
			for m := range bad {
				fmt.Fprintf(&g, "	%q [color=\"red\"];\n", m.Path)
			}
			g.WriteString("}")
			svg, err := renderGraph(ctx, &g)
			if err != nil {
				return err
			}
			js.Global().Get("document").Get("body").Set("innerHTML", string(svg))
			time.Sleep(sleep)
		}
	}
	fmt.Println("done")
	return nil
}
