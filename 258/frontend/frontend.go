package main

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"syscall/js"

	"github.com/shurcooL/play/258/frontend/jsutil"
	"github.com/shurcooL/play/258/frontend/selectlistview"
	"github.com/shurcooL/play/258/frontend/tableofcontents"
	"honnef.co/go/js/dom/v2"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

var state selection

type selection struct {
	valid bool
	file  string
	start int // Start line of selection, or 0 if there's no line selection. First line is 1.
	end   int // End line of selection. Same as start if it's one line selection.
}

// Hash returns a hash encoding of the selection, without '#'.
func (s selection) Hash() string {
	if !s.valid {
		return ""
	}
	hash := s.file
	if s.start != 0 {
		hash += fmt.Sprintf("-L%d", s.start)
	}
	if s.start != s.end {
		hash += fmt.Sprintf("-L%d", s.end)
	}
	return hash
}

func setupFrontend(u *url.URL) {
	js.Global().Set("LineNumber", jsutil.Wrap(LineNumber))

	tableofcontents.Setup()
	selectlistview.Setup(u)

	// Jump to desired hash after page finishes loading (and override browser's default hash jumping).
	processHashSet()
	// Start watching for hashchange events.
	dom.GetWindow().AddEventListener("hashchange", false, func(event dom.Event) {
		event.PreventDefault()

		processHashSet()
	})

	document.Body().AddEventListener("keydown", false, func(event dom.Event) {
		if event.DefaultPrevented() {
			return
		}
		// Ignore when some element other than body has focus (it means the user is typing elsewhere).
		if !event.Target().IsEqualNode(document.Body()) {
			return
		}

		switch ke := event.(*dom.KeyboardEvent); {
		// Escape.
		case ke.KeyCode() == 27 && !ke.Repeat() && !ke.CtrlKey() && !ke.AltKey() && !ke.MetaKey() && !ke.ShiftKey():
			url := *u
			url.Fragment = ""
			// TODO: dom.GetWindow().History().ReplaceState(...), blocked on https://github.com/dominikh/go-js-dom/issues/41.
			js.Global().Get("window").Get("history").Call("replaceState", nil, nil, url.String())

			processHashSet()

			ke.PreventDefault()
		}
	})
}

// LineNumber handles a click on a line number.
// targetID must point to a valid target.
func LineNumber(event dom.Event, targetID string) {
	targetID = expandLineSelection(event, targetID)

	// TODO: dom.GetWindow().History().ReplaceState(...)
	js.Global().Get("window").Get("history").Call("replaceState", nil, nil, "#"+targetID)

	processHash(targetID, true)
}

// expandLineSelection expands line selection if shift was held down when clicking a line number,
// and it's in the same file as already highlighted. Otherwise return original targetID unmodified.
func expandLineSelection(event dom.Event, targetID string) string {
	me, ok := event.(*dom.MouseEvent)
	if !(ok && me.ShiftKey() && state.valid && state.start != 0) {
		return targetID
	}
	file, start, end := parseHash(targetID)
	if !(file == state.file && start != 0) {
		return targetID
	}
	switch {
	case start < state.start:
		state.start = start
	case end > state.end:
		state.end = end
	}
	return state.Hash()
}

func processHashSet() {
	// Scroll to hash target.
	hash := strings.TrimPrefix(dom.GetWindow().Location().Hash(), "#")
	parts := strings.Split(hash, "-")
	var targetID string
	if file, start, _, ok := tryParseFileLineRange(parts); ok {
		targetID = fmt.Sprintf("%s-L%d", file, start)
	} else {
		targetID = hash
	}
	target, ok := document.GetElementByID(targetID).(dom.HTMLElement)
	if ok {
		windowHalfHeight := dom.GetWindow().InnerHeight() * 2 / 5
		dom.GetWindow().ScrollTo(dom.GetWindow().ScrollX(), int(offsetTopRoot(target)+target.OffsetHeight())-windowHalfHeight)
	}

	processHash(hash, ok)
}

// processHash handles the given hash.
// valid is true iff the hash points to a valid target.
func processHash(hash string, valid bool) {
	// Clear everything.
	for _, e := range document.GetElementsByClassName("selection") {
		e.(dom.HTMLElement).Style().SetProperty("display", "none", "")
	}

	if !valid {
		state.valid = false
		return
	}

	file, start, end := parseHash(hash)
	state.file, state.start, state.end, state.valid = file, start, end, true

	if start != 0 {
		startElement := document.GetElementByID(fmt.Sprintf("%s-L%d", file, start)).(dom.HTMLElement)
		var endElement dom.HTMLElement
		if end == start {
			endElement = startElement
		} else {
			endElement = document.GetElementByID(fmt.Sprintf("%s-L%d", file, end)).(dom.HTMLElement)
		}

		fileHeader := document.GetElementByID(file).(dom.HTMLElement)
		fileBackground := fileHeader.ParentElement().GetElementsByClassName("selection")[0].(dom.HTMLElement)
		fileBackground.Style().SetProperty("display", "initial", "")
		fileBackground.Style().SetProperty("top", fmt.Sprintf("%vpx", startElement.OffsetTop()), "")
		fileBackground.Style().SetProperty("height", fmt.Sprintf("%vpx", endElement.OffsetTop()-startElement.OffsetTop()+endElement.OffsetHeight()), "")
	}
}

func parseHash(hash string) (file string, start, end int) {
	parts := strings.Split(hash, "-")
	if file, start, end, ok := tryParseFileLineRange(parts); ok {
		return file, start, end
	} else if file, line, ok := tryParseFileLine(parts); ok {
		return file, line, line
	} else {
		return hash, 0, 0
	}
}

func tryParseFileLineRange(parts []string) (file string, start, end int, ok bool) {
	if len(parts) < 3 {
		return "", 0, 0, false
	}
	{
		secondLastPart := parts[len(parts)-2]
		if len(secondLastPart) < 2 || secondLastPart[0] != 'L' {
			return "", 0, 0, false
		}
		var err error
		start, err = strconv.Atoi(secondLastPart[1:])
		if err != nil {
			return "", 0, 0, false
		}
	}
	{
		lastPart := parts[len(parts)-1]
		if len(lastPart) < 2 || lastPart[0] != 'L' {
			return "", 0, 0, false
		}
		var err error
		end, err = strconv.Atoi(lastPart[1:])
		if err != nil {
			return "", 0, 0, false
		}
	}
	return strings.Join(parts[:len(parts)-2], "-"), start, end, true
}

func tryParseFileLine(parts []string) (file string, line int, ok bool) {
	if len(parts) < 2 {
		return "", 0, false
	}
	lastPart := parts[len(parts)-1]
	if len(lastPart) < 2 || lastPart[0] != 'L' {
		return "", 0, false
	}
	line, err := strconv.Atoi(lastPart[1:])
	if err != nil {
		return "", 0, false
	}
	return strings.Join(parts[:len(parts)-1], "-"), line, true
}

// offsetTopRoot returns the offset top of element e relative to root element.
func offsetTopRoot(e dom.HTMLElement) float64 {
	var offsetTopRoot float64
	for ; e != nil; e = e.OffsetParent() {
		offsetTopRoot += e.OffsetTop()
	}
	return offsetTopRoot
}
