package main

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"os"
	"syscall/js"

	"github.com/rogpeppe/go-internal/modfile"
	"github.com/rogpeppe/go-internal/module"
)

func serveGraph2(ctx context.Context, query string, mp moduleProxy) error {
	mod := parseQuery(query)
	frontier := []module.Version{mod}
	type edge struct {
		From, To module.Version
	}
	edges := make(map[edge]struct{})
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
				From: mod,
				To:   r.Mod,
			}
			edges[e] = struct{}{}
		}
		var g bytes.Buffer
		g.WriteString("digraph \"\" {\n")
		for e := range edges {
			fmt.Fprintf(&g, "	%q -> %q [URL=%q];\n", e.From.Path+"@"+e.From.Version, e.To.Path+"@"+e.To.Version, "/gomod/"+e.From.Path+"@"+e.From.Version)
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
		//time.Sleep(3 * time.Second)
	}
	fmt.Println("done")
	return nil
}
