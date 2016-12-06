package svg

import (
	"fmt"
	"strings"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

func Render(symbol string) string {
	switch symbol {
	case "issue-opened":
		return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="16" viewBox="0 0 14 16"><path d="M7 2.3c3.14 0 5.7 2.56 5.7 5.7s-2.56 5.7-5.7 5.7A5.71 5.71 0 0 1 1.3 8c0-3.14 2.56-5.7 5.7-5.7zM7 1C3.14 1 0 4.14 0 8s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7zm1 3H6v5h2V4zm0 6H6v2h2v-2z"/></svg>`
	case "plus":
		return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="16" viewBox="0 0 12 16"><path d="M12 9H7v5H5V9H0V7h5V2h2v5h5z"/></svg>`
	case "circle-slash":
		return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="16" viewBox="0 0 14 16"><path d="M7 1C3.14 1 0 4.14 0 8s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7zm0 1.3c1.3 0 2.5.44 3.47 1.17l-8 8A5.755 5.755 0 0 1 1.3 8c0-3.14 2.56-5.7 5.7-5.7zm0 11.41c-1.3 0-2.5-.44-3.47-1.17l8-8c.73.97 1.17 2.17 1.17 3.47 0 3.14-2.56 5.7-5.7 5.7z"/></svg>`
	case "bell":
		return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="16" viewBox="0 0 14 16"><path d="M14 12v1H0v-1l.73-.58c.77-.77.81-2.55 1.19-4.42C2.69 3.23 6 2 6 2c0-.55.45-1 1-1s1 .45 1 1c0 0 3.39 1.23 4.16 5 .38 1.88.42 3.66 1.19 4.42l.66.58H14zm-7 4c1.11 0 2-.89 2-2H5c0 1.11.89 2 2 2z"/></svg>`
	default:
		return "TODO"
	}
}

func Octicon(symbol string) *html.Node {
	e, err := html.ParseFragment(strings.NewReader(Render(symbol)), nil)
	if err != nil {
		panic(fmt.Errorf("internal error: html.ParseFragment failed: %v", err))
	}
	svg := e[0].LastChild.FirstChild // TODO: Is there a better way to just get the <svg>...</svg> element directly, skipping <html><head></head><body><svg>...</svg></body></html>?
	svg.Parent.RemoveChild(svg)
	for i, attr := range svg.Attr {
		if attr.Namespace == "" && attr.Key == "width" {
			svg.Attr[i].Val = "16"
			break
		}
	}
	svg.Attr = append(svg.Attr, html.Attribute{Key: atom.Style.String(), Val: `vertical-align: top;`})
	return svg
}
