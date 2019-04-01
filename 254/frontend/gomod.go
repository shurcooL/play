package main

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"os"
	"syscall/js"
	"text/template"

	"github.com/rogpeppe/go-internal/modfile"
	"github.com/sourcegraph/annotate"
)

func serveGoMod(ctx context.Context, query string, mp moduleProxy) error {
	mod := parseQuery(query)
	goMod, err := mp.GoMod(ctx, mod)
	if os.IsNotExist(err) {
		js.Global().Get("document").Get("body").Set("innerHTML", "404 Not Found")
		return nil
	} else if err != nil {
		return err
	}
	f, err := modfile.Parse("go.mod", goMod, nil)
	if err != nil {
		return err
	}
	var anns annotate.Annotations
	for _, r := range f.Require {
		switch {
		case !r.Syntax.InBlock && len(r.Syntax.Token) == 3:
			anns = append(anns, &annotate.Annotation{
				Start: r.Syntax.Start.Byte + len(r.Syntax.Token[0]) + 1,
				End:   r.Syntax.Start.Byte + len(r.Syntax.Token[0]) + 1 + len(r.Syntax.Token[1]),
				Left:  []byte(fmt.Sprintf(`<a href="%s">`, "/gomod/"+r.Mod.Path)), // TODO: escape
				Right: []byte(`</a>`),
			})
			anns = append(anns, &annotate.Annotation{
				Start: r.Syntax.End.Byte - len(r.Syntax.Token[2]),
				End:   r.Syntax.End.Byte,
				Left:  []byte(fmt.Sprintf(`<a href="%s">`, "/gomod/"+r.Mod.Path+"@"+r.Mod.Version)), // TODO: escape
				Right: []byte(`</a>`),
			})
		case r.Syntax.InBlock && len(r.Syntax.Token) == 2:
			anns = append(anns, &annotate.Annotation{
				Start: r.Syntax.Start.Byte,
				End:   r.Syntax.Start.Byte + len(r.Syntax.Token[0]),
				Left:  []byte(fmt.Sprintf(`<a href="%s">`, "/gomod/"+r.Mod.Path)), // TODO: escape
				Right: []byte(`</a>`),
			})
			anns = append(anns, &annotate.Annotation{
				Start: r.Syntax.End.Byte - len(r.Syntax.Token[1]),
				End:   r.Syntax.End.Byte,
				Left:  []byte(fmt.Sprintf(`<a href="%s">`, "/gomod/"+r.Mod.Path+"@"+r.Mod.Version)), // TODO: escape
				Right: []byte(`</a>`),
			})
		default:
			log.Printf("r.Syntax.InBlock, len(r.Syntax.Token) = %v, %d; want false/3 or true/2", r.Syntax.InBlock, len(r.Syntax.Token))
		}
	}
	annotatedGoMod, err := annotate.Annotate(goMod, anns, template.HTMLEscape)
	if err != nil {
		return err
	}
	var buf bytes.Buffer
	buf.WriteString("<pre>")
	buf.Write(annotatedGoMod)
	buf.WriteString("</pre>")
	js.Global().Get("document").Get("body").Set("innerHTML", buf.String())
	return nil
}
