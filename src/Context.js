/**
 * Created by Jacky.gao on 2016/6/28.
 */
import Raphael from 'raphael'
import UndoManager from 'undo-manager'
import SelectTool from './tools/SelectTool.js'
import ConnectionTool from './tools/ConnectionTool.js'
import Connection from './Connection.js'
import * as event from './event.js'
import Node from './Node.js'
import { v4 } from 'uuid'

export default class Context {
  constructor(container) {
    this.undoManager = new UndoManager()
    this.toolsMap = new Map()
    this._initBuiltinTools()
    this.container = container
    this.paper = new Raphael(container[0], '100%', '100%')
    this.allFigures = []
    this.selectionFigures = []
    this.selectionRects = this.paper.set()
    this.selectionPaths = this.paper.set()
    this.currentConnection = null
    this._initEvent()
  }
  selectFigure(figure) {
    this.startSelect()
    this.addSelection(figure)
    this.endSelect()
  }

  startSelect() {
    this.resetSelection()
  }

  resizePaper(newWidth, newHeight) {
    const w = this.container.width(),
      h = this.container.height()
    if (newWidth > w) {
      this.container.width(newWidth + 10)
    }
    if (newHeight > h) {
      this.container.height(newHeight + 10)
    }
  }

  addRedoUndo(redoUndo) {
    this.undoManager.add(redoUndo)
  }

  addSelection(figure) {
    this.selectionFigures.push(figure)
    if (figure instanceof Connection) {
      this.selectionPaths.push(figure.path)
    } else {
      this.selectionRects.push(figure.rect)
    }
  }
  endSelect() {
    this.selectionRects.attr('stroke', '#FF9800')
    this.selectionPaths.attr({ stroke: '#999', 'stroke-dasharray': '20' })
    let firstSelectFigure = null
    this.selectionFigures.forEach((figure, index) => {
      if (!firstSelectFigure) {
        firstSelectFigure = figure
      }
      if (figure instanceof Connection) {
        figure.select()
      }
    })
    if (firstSelectFigure) {
      event.eventEmitter.emit(event.OBJECT_SELECTED, firstSelectFigure)
    }
  }
  resetSelection() {
    this.selectionRects.attr('stroke', '#fff')
    this.selectionPaths.attr({ stroke: '#999', 'stroke-dasharray': 'none' })
    this.selectionRects = this.paper.set()
    this.selectionPaths = this.paper.set()
    this.selectionFigures.forEach((figure, index) => {
      if (figure instanceof Connection) {
        figure.unSelect()
      }
    })
    this.selectionFigures.splice(0, this.selectionFigures.length)
    event.eventEmitter.emit(event.CANVAS_SELECTED)
  }
  registerTool(tool) {
    const type = tool.getType()
    if (this.toolsMap.has(type)) {
      throw `Figure [${type}] already exist.`
    }
    this.toolsMap.set(type, tool)
  }

  nextUUID() {
    return v4()
  }

  getFigureById(id) {
    let target
    for (let figure of this.allFigures) {
      if (figure instanceof Node) {
        if (figure.rect.id === id || figure.icon.id === id || figure.text.id === id) {
          target = figure
          break
        }
      }
    }
    return target
  }

  getNodeByUUID(uuid) {
    let targetNode
    for (let node of this.allFigures) {
      if (node.uuid === uuid) {
        targetNode = node
        break
      }
    }
    return targetNode
  }

  removeFigureByUUID(uuid) {
    const targetNode = this.getNodeByUUID(uuid)
    const pos = this.allFigures.indexOf(targetNode)
    this.allFigures.splice(pos, 1)
    targetNode.remove()
  }

  cancelConnection() {
    if (this.currentConnection) {
      const fromConnections = this.currentConnection.from.fromConnections
      const pos = fromConnections.indexOf(this.currentConnection)
      fromConnections.splice(pos, 1)
      this.currentConnection.path.remove()
      if (this.currentConnection.text) {
        this.currentConnection.text.remove()
      }
    }
    this.currentConnection = null
  }

  _initEvent() {
    event.eventEmitter.on(event.TRIGGER_TOOL, (nodeName) => {
      if (!this.toolsMap.has(nodeName)) {
        throw `Node ${nodeName} not exist.`
      }
      this.currentTool = this.toolsMap.get(nodeName)
      this.cancelConnection()
    })
    event.eventEmitter.on(event.REMOVE_CLICKED, () => {
      const selections = [...this.selectionFigures]
      if (selections === 0) {
        return
      }
      this.resetSelection()
      selections.forEach((select, index) => {
        const jsonData = select.toJSON(),
          uuid = select.uuid,
          _this = this
        if (select instanceof Connection) {
          this.addRedoUndo({
            redo: function () {
              const conn = _this.getNodeByUUID(uuid)
              const fromUUID = conn.from.uuid,
                toUUID = conn.to.uuid
              let fromNode = _this.context.getNodeByUUID(fromUUID),
                toNode = _this.context.getNodeByUUID(toUUID)
              const newConnection = new Connection(fromNode, {
                x: fromNode.rect.attr('x'),
                y: fromNode.rect.attr('y')
              })
              fromNode.fromConnections.push(newConnection)
              toNode.toConnections.push(newConnection)
              newConnection.to = toNode
              newConnection.fromJSON(jsonData)
            },
            undo: function () {
              _this.removeFigureByUUID(uuid)
            }
          })
        } else {
          const tool = select._tool
          this.addRedoUndo({
            redo: function () {
              _this.removeFigureByUUID(uuid)
            },
            undo: function () {
              const newNode = tool._newNodeInstance(10, 10, '')
              if (newNode) {
                newNode.initFromJson(jsonData)
                newNode._buildConnections()
              }
            }
          })
        }
        this.removeFigureByUUID(uuid)
      })
    })
    event.eventEmitter.on(event.ALIGN_LEFT, () => {
      let x = -1,
        y = -1,
        w,
        map = new Map(),
        index = 0
      let minX = -1,
        minWidth = -1
      for (let select of this.selectionFigures) {
        if (select instanceof Connection) {
          break
        }
        w = select.rect.attr('width')
        const currentX = select.rect.attr('x')
        if (minX == -1) {
          minX = currentX
          minWidth = w
        } else {
          if (minX > currentX) {
            minX = currentX
            minWidth = w
          }
        }
      }
      for (let select of this.selectionFigures) {
        if (select instanceof Connection) {
          break
        }
        w = select.rect.attr('width')
        let data = { oldXY: { x: select.rect.attr('x'), y: select.rect.attr('y') } }
        select.moveTo(minX + w / 2, y)
        data.newXY = { x: select.rect.attr('x'), y: select.rect.attr('y') }
        map.set(select.uuid, data)
        index++
      }
      const _this = this
      this.addRedoUndo({
        redo: function () {
          for (let uuid of map.keys()) {
            let node = _this.getNodeByUUID(uuid),
              data = map.get(uuid)
            const { newXY } = data
            node.move(newXY.x, newXY.y, node.rect.attr('width'), node.rect.attr('height'))
          }
        },
        undo: function () {
          for (let uuid of map.keys()) {
            let node = _this.getNodeByUUID(uuid),
              data = map.get(uuid)
            const { oldXY } = data
            node.move(oldXY.x, oldXY.y, node.rect.attr('width'), node.rect.attr('height'))
          }
        }
      })
    })
    event.eventEmitter.on(event.ALIGN_CENTER, () => {
      let x = -1,
        y = -1,
        w,
        map = new Map(),
        index = 0
      let selectRects = []
      //collect area
      for (let select of this.selectionFigures) {
        if (select instanceof Connection) {
          break
        }
        let center = select.rect.attr('y')
        let height = select.rect.attr('height')
        selectRects.push({
          start: center - height / 2,
          end: center + height / 2,
          uuid: this.nextUUID()
        })
      }
      //judeg area mixed
      let mixed = false
      for (let rect of selectRects) {
        for (let rect2 of selectRects) {
          if (
            rect.uuid != rect2.uuid &&
            ((rect.start >= rect2.start && rect.start <= rect2.end) ||
              (rect.end >= rect2.start && rect.end <= rect2.end))
          ) {
            mixed = true
            break
          }
        }
        if (mixed) {
          break
        }
      }
      if (!mixed) {
        for (let select of this.selectionFigures) {
          if (select instanceof Connection) {
            break
          }
          let data = { oldXY: { x: select.rect.attr('x'), y: select.rect.attr('y') } }
          if (index === 0) {
            ;(x = select.rect.attr('x')), (w = select.rect.attr('width'))
            x += w / 2
          } else {
            select.moveTo(x, y)
          }
          data.newXY = { x: select.rect.attr('x'), y: select.rect.attr('y') }
          map.set(select.uuid, data)
          index++
        }
      } else {
        for (let select of this.selectionFigures) {
          if (select instanceof Connection) {
            break
          }
          let data = { oldXY: { x: select.rect.attr('x'), y: select.rect.attr('y') } }
          let height
          if (index === 0) {
            x = select.rect.attr('x')
            y = select.rect.attr('y')
          } else {
            height = select.rect.attr('height')
            y = y + height / 2 + 100
            select.move(x, y, select.rect.attr('width'), height)
          }
          data.newXY = { x: select.rect.attr('x'), y: select.rect.attr('y') }
          map.set(select.uuid, data)
          index++
        }
      }
      const _this = this
      this.addRedoUndo({
        redo: function () {
          for (let uuid of map.keys()) {
            let node = _this.getNodeByUUID(uuid),
              data = map.get(uuid)
            const { newXY } = data
            node.move(newXY.x, newXY.y, node.rect.attr('width'), node.rect.attr('height'))
          }
        },
        undo: function () {
          for (let uuid of map.keys()) {
            let node = _this.getNodeByUUID(uuid),
              data = map.get(uuid)
            const { oldXY } = data
            node.move(oldXY.x, oldXY.y, node.rect.attr('width'), node.rect.attr('height'))
          }
        }
      })
    })
    event.eventEmitter.on(event.ALIGN_RIGHT, () => {
      let x = -1,
        y = -1,
        w,
        map = new Map(),
        index = 0
      let maxX = -1
      for (let select of this.selectionFigures) {
        if (select instanceof Connection) {
          break
        }
        w = select.rect.attr('width')
        const currentX = select.rect.attr('x') + w
        if (maxX == -1) {
          maxX = currentX
        } else {
          if (maxX < currentX) {
            maxX = currentX
          }
        }
      }
      for (let select of this.selectionFigures) {
        if (select instanceof Connection) {
          break
        }
        w = select.rect.attr('width')
        let data = { oldXY: { x: select.rect.attr('x'), y: select.rect.attr('y') } }
        select.moveTo(maxX - w / 2, y)
        data.newXY = { x: select.rect.attr('x'), y: select.rect.attr('y') }
        map.set(select.uuid, data)
        index++
      }
      const _this = this
      this.addRedoUndo({
        redo: function () {
          for (let uuid of map.keys()) {
            let node = _this.getNodeByUUID(uuid),
              data = map.get(uuid)
            const { newXY } = data
            node.move(newXY.x, newXY.y, node.rect.attr('width'), node.rect.attr('height'))
          }
        },
        undo: function () {
          for (let uuid of map.keys()) {
            let node = _this.getNodeByUUID(uuid),
              data = map.get(uuid)
            const { oldXY } = data
            node.move(oldXY.x, oldXY.y, node.rect.attr('width'), node.rect.attr('height'))
          }
        }
      })
    })
    event.eventEmitter.on(event.ALIGN_TOP, () => {
      let x = -1,
        y = -1,
        h,
        map = new Map(),
        index = 0
      let minY = -1
      for (let select of this.selectionFigures) {
        if (select instanceof Connection) {
          break
        }
        const currentY = select.rect.attr('y')
        if (minY == -1) {
          minY = currentY
        } else {
          if (minY > currentY) {
            minY = currentY
          }
        }
      }
      for (let select of this.selectionFigures) {
        if (select instanceof Connection) {
          break
        }
        h = select.rect.attr('height')
        let data = { oldXY: { x: select.rect.attr('x'), y: select.rect.attr('y') } }
        select.moveTo(x, minY + h / 2)
        data.newXY = { x: select.rect.attr('x'), y: select.rect.attr('y') }
        map.set(select.uuid, data)
        index++
      }
      const _this = this
      this.addRedoUndo({
        redo: function () {
          for (let uuid of map.keys()) {
            let node = _this.getNodeByUUID(uuid),
              data = map.get(uuid)
            const { newXY } = data
            node.move(newXY.x, newXY.y, node.rect.attr('width'), node.rect.attr('height'))
          }
        },
        undo: function () {
          for (let uuid of map.keys()) {
            let node = _this.getNodeByUUID(uuid),
              data = map.get(uuid)
            const { oldXY } = data
            node.move(oldXY.x, oldXY.y, node.rect.attr('width'), node.rect.attr('height'))
          }
        }
      })
    })
    event.eventEmitter.on(event.ALIGN_MIDDLE, () => {
      let x = -1,
        y = -1,
        w,
        h,
        map = new Map(),
        index = 0
      let selectRects = []
      //collect area
      for (let select of this.selectionFigures) {
        if (select instanceof Connection) {
          break
        }
        let center = select.rect.attr('x')
        let width = select.rect.attr('width')
        selectRects.push({
          start: center - width / 2,
          end: center + width / 2,
          uuid: this.nextUUID()
        })
      }
      //judeg area mixed
      let mixed = false
      for (let rect of selectRects) {
        for (let rect2 of selectRects) {
          if (
            rect.uuid != rect2.uuid &&
            ((rect.start >= rect2.start && rect.start <= rect2.end) ||
              (rect.end >= rect2.start && rect.end <= rect2.end))
          ) {
            mixed = true
            break
          }
        }
        if (mixed) {
          break
        }
      }
      if (!mixed) {
        for (let select of this.selectionFigures) {
          if (select instanceof Connection) {
            break
          }
          let data = { oldXY: { x: select.rect.attr('x'), y: select.rect.attr('y') } }
          if (index === 0) {
            ;(y = select.rect.attr('y')), (h = select.rect.attr('height'))
            y += h / 2
          } else {
            select.moveTo(x, y)
          }
          data.newXY = { x: select.rect.attr('x'), y: select.rect.attr('y') }
          map.set(select.uuid, data)
          index++
        }
      } else {
        for (let select of this.selectionFigures) {
          if (select instanceof Connection) {
            break
          }
          let data = { oldXY: { x: select.rect.attr('x'), y: select.rect.attr('y') } }
          if (index === 0) {
            x = select.rect.attr('x')
            y = select.rect.attr('y')
          } else {
            w = select.rect.attr('width')
            x = x + w / 2 + 100
            select.move(x, y, w, select.rect.attr('height'))
          }
          data.newXY = { x: select.rect.attr('x'), y: select.rect.attr('y') }
          map.set(select.uuid, data)
          index++
        }
      }
      const _this = this
      this.addRedoUndo({
        redo: function () {
          for (let uuid of map.keys()) {
            let node = _this.getNodeByUUID(uuid),
              data = map.get(uuid)
            const { newXY } = data
            node.move(newXY.x, newXY.y, node.rect.attr('width'), node.rect.attr('height'))
          }
        },
        undo: function () {
          for (let uuid of map.keys()) {
            let node = _this.getNodeByUUID(uuid),
              data = map.get(uuid)
            const { oldXY } = data
            node.move(oldXY.x, oldXY.y, node.rect.attr('width'), node.rect.attr('height'))
          }
        }
      })
    })
    event.eventEmitter.on(event.ALIGN_BOTTOM, () => {
      let x = -1,
        y = -1,
        h,
        map = new Map(),
        index = 0
      let maxY = -1
      for (let select of this.selectionFigures) {
        if (select instanceof Connection) {
          break
        }
        h = select.rect.attr('height')
        const currentY = select.rect.attr('y') + h
        if (maxY == -1) {
          maxY = currentY
        } else {
          if (maxY < currentY) {
            maxY = currentY
          }
        }
      }
      for (let select of this.selectionFigures) {
        if (select instanceof Connection) {
          break
        }
        h = select.rect.attr('height')
        let data = { oldXY: { x: select.rect.attr('x'), y: select.rect.attr('y') } }
        select.moveTo(x, maxY - h / 2)
        data.newXY = { x: select.rect.attr('x'), y: select.rect.attr('y') }
        map.set(select.uuid, data)
        index++
      }
      const _this = this
      this.addRedoUndo({
        redo: function () {
          for (let uuid of map.keys()) {
            let node = _this.getNodeByUUID(uuid),
              data = map.get(uuid)
            const { newXY } = data
            node.move(newXY.x, newXY.y, node.rect.attr('width'), node.rect.attr('height'))
          }
        },
        undo: function () {
          for (let uuid of map.keys()) {
            let node = _this.getNodeByUUID(uuid),
              data = map.get(uuid)
            const { oldXY } = data
            node.move(oldXY.x, oldXY.y, node.rect.attr('width'), node.rect.attr('height'))
          }
        }
      })
    })
    event.eventEmitter.on(event.UNIFY_SIZE, () => {
      let w,
        h,
        map = new Map(),
        index = 0
      for (let select of this.selectionFigures) {
        if (select instanceof Connection) {
          break
        }
        let data = { oldWH: { w: select.rect.attr('width'), h: select.rect.attr('height') } }
        if (index === 0) {
          ;(w = select.rect.attr('width')), (h = select.rect.attr('height'))
        } else {
          select.changeSize(w, h)
        }
        data.newWH = { w: select.rect.attr('width'), h: select.rect.attr('height') }
        map.set(select.uuid, data)
        index++
      }
      const _this = this
      this.addRedoUndo({
        redo: function () {
          for (let uuid of map.keys()) {
            let node = _this.getNodeByUUID(uuid),
              data = map.get(uuid)
            const newWH = data.newWH
            node.changeSize(newWH.w, newWH.h)
          }
        },
        undo: function () {
          for (let uuid of map.keys()) {
            let node = _this.getNodeByUUID(uuid),
              data = map.get(uuid)
            const oldWH = data.oldWH
            node.changeSize(oldWH.w, oldWH.h)
          }
        }
      })
    })
  }

  _initBuiltinTools() {
    this.selectTool = new SelectTool()
    this.connectionTool = new ConnectionTool()
    this.selectTool.context = this
    this.connectionTool.context = this
    this.currentTool = this.selectTool
  }
}
