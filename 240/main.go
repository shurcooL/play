package main

import (
	"encoding/json"
	"fmt"
	"reflect"
)

func main() {
	//reflectA()
	//reflectB()
	//reflectΦExported()
	//reflectC()
	//fmt.Println()
	//a()
	//fmt.Println()
	b()
	//fmt.Println()
	//c()
}

func a() {
	mt := reflect.TypeOf(map[string][1]int{})
	m := reflect.MakeMap(mt)

	k := reflect.ValueOf("foo")
	v := reflect.New(mt.Elem()).Elem()
	v.Index(0).SetInt(1337)
	/*v := reflect.New(reflect.SliceOf(reflect.TypeOf((*int)(nil)).Elem())).Elem()
	v = reflect.Append(v, reflect.ValueOf(1338))*/
	m.SetMapIndex(k, v)

	//println(m.Interface())
	fmt.Printf("%#v\n", m.Interface())
}

func b() {
	var v map[string][2]float64
	err := json.Unmarshal([]byte(`{"a": [350, 350]}`), &v)
	if err != nil {
		fmt.Println(err)
		return
	}
	fmt.Printf("%#v\n", v)
}

func c() {
	v1 := reflect.ValueOf([1]int{42})
	v2 := reflect.New(reflect.TypeOf((*[1]int)(nil)).Elem()).Elem()
	v2.Set(v1)

	fmt.Printf("%#v\n", v2.Interface())
}

func reflectA() {
	type miscPlaneTag struct {
		V string `json:"色は匂へど"`
	}
	b, err := json.Marshal(miscPlaneTag{"いろはにほへと"})
	if err != nil {
		fmt.Println(err)
		return
	}
	fmt.Println(string(b))
}

func reflectB() {
	type miscPlaneTag struct {
		V string `json:"色は匂へど"`
	}
	t := reflect.TypeOf(miscPlaneTag{})
	f := t.Field(0)
	fmt.Println(f.Tag)
}

func reflectΦExported() {
	myFindableString := "ΦExported is okay: 色は匂へど"
	fmt.Println(myFindableString)
}

type NonExportedFirst int

func (i NonExportedFirst) ΦExported() int          { println("ok"); return 0 }
func (i NonExportedFirst) nonexported() (int, int) { panic("wrong") }

func reflectC() {
	m := reflect.ValueOf(NonExportedFirst(0)).Method(0)

	println(m.Type().NumOut())

	// TODO: Fix this. The call below fails with:
	//
	//	var $call = function(fn, rcvr, args) { return fn.apply(rcvr, args); };
	//	                                                 ^
	//	TypeError: Cannot read property 'apply' of undefined

	// Shouldn't panic.
	m.Call(nil)
}

/*
type NonExportedFirst int

func (i NonExportedFirst) ΦExported()       {}
func (i NonExportedFirst) nonexported() int { panic("wrong") }

func TestIssue22073(t *testing.T) {
	m := ValueOf(NonExportedFirst(0)).Method(0)

	if got := m.Type().NumOut(); got != 0 {
		t.Errorf("NumOut: got %v, want 0", got)
	}

	// Shouldn't panic.
	m.Call(nil)
}
*/

/*func main() {
	tmpl := template.Must(template.New("x").Parse("{{.E}}"))
	got := new(bytes.Buffer)
	testData := struct{ E error }{} // any non-empty interface here will do; error is just ready at hand
	tmpl.Execute(got, testData)
	fmt.Println(got.String())
}*/
