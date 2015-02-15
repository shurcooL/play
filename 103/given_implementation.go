package task

// Implementation details of given interfaces (needed for test code to run).

// e implements Data<int> interface for a single element.
type e int

func (_ e) IsCollection() bool               { return false }
func (_ e) GetCollection() CollectionDataInt { panic("not collection") }
func (e e) GetElement() int                  { return int(e) }

// c implements Data<int> interface for a collection of DataInt.
type c collectionDataInt

func (_ c) IsCollection() bool               { return true }
func (c c) GetCollection() CollectionDataInt { return collectionDataInt(c) }
func (_ c) GetElement() int                  { panic("not element") }

// collectionDataInt implements Collection<E> where E is Data<int>.
type collectionDataInt []DataInt

func (c collectionDataInt) IsEmpty() bool             { return len(c) == 0 }
func (c collectionDataInt) Iterator() IteratorDataInt { return &collectionDataIntIterator{C: c} }
func (c collectionDataInt) Size() int                 { return len(c) }

// collectionDataIntIterator implements Iterator<E> where E is Data<int>.
type collectionDataIntIterator struct {
	C     collectionDataInt // Collection being iterated.
	index int               // Index of the next element.
}

func (it *collectionDataIntIterator) HasNext() bool {
	return it.index < len(it.C)
}

func (it *collectionDataIntIterator) Next() DataInt {
	e := it.C[it.index]
	it.index++
	return e
}
