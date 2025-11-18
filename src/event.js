/**
 * Created by Jacky.gao on 2016/6/30.
 */
import events from 'events'

export const TRIGGER_TOOL = 'trigger_tool'
export const OBJECT_SELECTED = 'object_selected'
export const CANVAS_SELECTED = 'canvas_selected'
export const SNAPTO_SELECTED = 'snapto_selected'
export const REMOVE_CLICKED = 'remove_clicked'
export const ALIGN_LEFT = 'align_left'
export const ALIGN_CENTER = 'align_center'
export const ALIGN_RIGHT = 'align_right'
export const ALIGN_TOP = 'align_top'
export const ALIGN_MIDDLE = 'align_middle'
export const ALIGN_BOTTOM = 'align_bottom'
export const UNIFY_SIZE = 'unify_size'

export const eventEmitter = new events.EventEmitter()
