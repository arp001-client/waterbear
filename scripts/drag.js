// Goals:
//
// Drag any block from block menu to canvas: clone and add to canvas
// Drag any block from anywhere besides menu to menu: delete block and attached blocks
// Drag any attached block to canvas: detach and add to canvas
// Drag any block (from block menu, canvas, or attached) to a matching, open attachment point: add to that script at that point
//    Triggers have no flap, so no attachment point
//    Steps can only be attached to flap -> slot
//    Values can only be attached to sockets of a compatible type
// Drag any block to anywhere that is not the block menu or on a canvas: undo the drag

// Drag Pseudocode
// 
// Mouse Dragging:
// 
// 1. On mousedown, test for potential drag target
// 2. On mousemove, if mousedown and target, start dragging
//     a) test for potential drop targets, remember them for hit testing
//     b) hit test periodically (not on mouse move)
//     c) clone element (if necessary)
//     d) if dragging out of a socket, replace with input of proper type
//     e) move drag target
// 3. On mouseup, if dragging, stop
//     a) test for drop, handle if necessary
//     b) clean up temporary elements, remove or move back if not dropping
//     
//     
// Touch dragging
// 
// 1. On touchmove, test for potential drag target, start dragging
//     a..d as above
// 2. On touchend, if dragging, stop
//    a..b as above

// Key to jquery.event.touch is the timer function for handling movement and hit testing

(function($){
    var dragTarget, potentialDropTargets, dropTarget, dropRects, startPosition, timer, cloned, dragging, currentPosition, distance, startParent, dropCursor, dragPlaceholder;
    window.isTouch = window.hasOwnProperty('ontouchstart') && true;
    var dragTimeout = 20;
    // TODO: update this whenever we switch to a new workspace
    var targetCanvas = $('.workspace:visible .scripts_workspace');
    
    var snapDist = 25; //In pixels
    
    function blockType(block){
        var model = block.data('model');
        if (model.blocktype === 'expression'){
            return model.type;
        }else{
            return model.blocktype;
        }
    }
    
    function reset(){
        dragTarget = null;
        potentialDropTargets = $();
        dropRects = [];
        dropTarget = $();
        startPosition = null;
        startParent = null;
        currentPosition = null;
        timer = null;
        dragging = false;
        cloned = false;
    }
    
    reset();
    
    function blend(event){
        if (isTouch){
            if (event.originalEvent.touches.length > 1){
                // console.log('blend fails, too many touches');
                return false;
            }
            var touch = event.originalEvent.touches[0];
            event.target = touch.target;
            event.pageX = touch.pageX;
            event.pageY = touch.pageY;
        }else{
            if (event.which !== 1){ // left mouse button 
                return false;
            }
        }
        // fix target?
        return event;
    }
    
    function getPotentialDropTargets(){
        switch(blockType(dragTarget)){
            case 'step': return stepTargets();
            case 'context': return stepTargets();
            case 'int': 
            case 'float': return socketTargets2(['any', 'number', blockType(dragTarget)].join(','));
            case 'any': return socketTargets2('any');
            default: return socketTargets2(['any', dragTarget.block_type()].join(','));
        }
    }
    
    function stepTargets(){
        return targetCanvas.find('.slot:only-child');
    }
    
    function socketTargets(type){
        return targetCanvas.find('.socket.' + type + ':not(:has(.value))');
    }
    
    /*a slower but more flexible way of doing the socket targets
    This method could have its setting be held in an array and 
    so might be better for config*/
    function socketTargets2(types){
        var typeArray = types.split(',');
        var res = $();
        for(var i = 0 ; i< typeArray.length ; i++)
        {
          res = res.add(targetCanvas.find('.socket.' + typeArray[i] + ':not(:has(.value))'));
        }
        return res;
    }
        
    function initDrag(event){
        // Called on mousedown or touchstart, we haven't started dragging yet
        // DONE: Don't start drag on a text input or select using :input jquery selector
        if (!blend(event)) {return undefined;}
        var eT = $(event.target);
        if ((eT.is(':input') || eT.is('option') || eT.is('.disclosure')) && ! eT.containedBy($('.block_menu'))) {return undefined;}
        // console.log('initDrag');
        var target = eT.closest('.wrapper');
        if (target.length){
            dragTarget = target; 
            //dragTarget.addClass("drag_indication");
            startPosition = target.offset();
            if (! target.parent().is('.scripts_workspace')){
                startParent = target.parent();
            }
        }else{
            //console.log('no target in initDrag');
            dragTarget = null;
        }
        return true;
    }
    
    function startDrag(event){
        // console.log('trying to start drag');
        // called on mousemove or touchmove if not already dragging
        if (!blend(event)) {return undefined;}
        if (!dragTarget) {return undefined;}
        dropCursor = $('<div class="dropCursor"></div>');
        targetCanvas.prepend(dropCursor);
        dragTarget.addClass("drag_indication");
        // console.log('startDrag');
        currentPosition = {left: event.pageX, top: event.pageY};
        // target = clone target if in menu
        if (dragTarget.is('.block_menu .wrapper')){
            dragTarget.removeClass('drag_indication');
            dragTarget = dragTarget.data('model').cloneScript().view();
            dragTarget.addClass('drag_indication');
            cloned = true;
        }
        dragging = true;
        // Make sure the workspace is available to drag to
        showWorkspace();
        // get position and append target to .content, adjust offsets
        // set last offset
        // TODO: handle detach better (generalize restoring sockets, put in language file)
        if (dragTarget.parent().is('.socket')){
            var classes = dragTarget.parent().attr('class');

            classes = classes.replace("socket","").trim();
            // console.log(classes);
            if(classes == "boolean"){           
                dragTarget.parent().append(
                    '<select><option>true</option><option>false</option></select>');
            }else{
                if(!classes || classes=="string"){
                    classes = '\"text\"';
                }
                dragTarget.parent().append('<input type="'+classes+'"/>');
            }
        }
        dragTarget.css('position', 'absolute');
        if (dragTarget.is('.scripts_workspace .wrapper')){
            dragPlaceholder = $('<div class="dragPlaceholder"></div>');
            dragPlaceholder.height(dragTarget.outerHeight());
            dragTarget.before(dragPlaceholder);
        }
        $('.content').append(dragTarget);
        dragTarget.offset(startPosition);
        potentialDropTargets = getPotentialDropTargets();
        // console.log('%s potential drop targets', potentialDropTargets.length);
        // console.log('drop targets: [%s]', $.map(potentialDropTargets, function(elem, idx){
        //     return $(elem).long_name();
        // }).join(', '));
        dropRects = $.map(potentialDropTargets, function(elem, idx){
            return $(elem).rect();
        });
        // console.log('%s dropRects', dropRects.length);
        // console.log('drop rects: %o', dropRects);

        // start timer for drag events
        timer = setTimeout(hitTest, dragTimeout);
        return false;
    }
    
    function drag(event){
        // console.log('trying to drag, honestly');
        if (!blend(event)) {return undefined;}
        if (!dragTarget) {return undefined;}
        if (!currentPosition) {startDrag(event);}
        event.preventDefault();
        // update the variables, distance, button pressed
        var nextPosition = {left: event.pageX, top: event.pageY};
        var dX = nextPosition.left - currentPosition.left;
        var dY = nextPosition.top - currentPosition.top;
        var currPos = dragTarget.offset();
        dragTarget.offset({left: currPos.left + dX, top: currPos.top + dY});
        currentPosition = nextPosition;
        return false;
    }
    
    function endDrag(end){
        // console.log('endDrag');
        clearTimeout(timer);
        timer = null;
        if (!dragging) {return undefined;}
        handle_drop();
        reset();
        return false;
    }
    
    function handle_drop(){
        // TODO:
           // is it over the menu
           // 1. Drop if there is a target
           // 2. Remove, if not over a canvas
           // 3. Remove, if dragging a clone
           // 4. Move back to start position if not a clone (maybe not?)
        dragTarget.removeClass('drag_active');
        dragTarget.removeClass("drag_indication");
        if (dropTarget && dropTarget.length){
            dropTarget.removeClass('drop_active');
            if (blockType(dragTarget) === 'step' || blockType(dragTarget) === 'context'){
                // Drag a step to snap to a step
                // console.log('snapping a step togther')
                dropTarget.parent().append(dragTarget);
                dragTarget.css({
                    position: 'relative',
                    left: 0,
                    top: 0,
                    display: 'inline-block'
                });
                dragTarget.trigger('add_to_script');
            }else{
                // Insert a value block into a socket
                // console.log('Inserting a value into a socket');
                dropTarget.find('input, select').remove();
                dropTarget.append(dragTarget);
                dragTarget.css({
                    position: 'relative',
                    left: 0,
                    top: 0,
                    display: 'inline-block'
                });
                dragTarget.trigger('add_to_socket');
            }
        }else if ($('.block_menu').cursorOver()){
            // delete block if dragged back to menu
            // console.log('deleting a block');
            dragTarget.trigger('delete_block');
            dragTarget.remove();
        }else if (dragTarget.overlap(targetCanvas)){
            // generally dragged to canvas, position it there
            // console.log('Drop onto canvas');
//            var currPos = dragTarget.offset();
            dropCursor.before(dragTarget);
            dropCursor.remove();
            dropCursor = null;
            dragTarget.css({position: 'relative', top: 0, left: 0, display: 'block'});
            dragTarget.trigger('add_to_workspace');
            $('.scripts_workspace').trigger('add');
        }else{
            if (cloned){
                // console.log('remove cloned block');
                dragTarget.remove();
            }else{
                // console.log('put block back where we found it');
                if (startParent){
                    if (startParent.is('.socket')){
                        startParent.children('input').remove();
                    }
                    startParent.append(dragTarget);
                    dragTarget.css({
                        position: 'relative',
                        top: 0,
                        left: 0,
                        display: 'inline-block'
                    });
                }else{
                    targetCanvas.append(dragTarget);
                    dragTarget.offset(startPosition);
                }
            }
        }
        if (dragPlaceholder){
            dragPlaceholder.remove();
            dragPlaceholder = null;
        }
        if (dropCursor){
            dropCursor.remove();
            dropCursor = null;
        }
    }
    
    function positionDropCursor(){
        var self, top, middle, bottom, x = dragTarget.position().top;
        // console.log('cursor: %s', x);
        targetCanvas.prepend(dropCursor);
        dropCursor.show();
        targetCanvas.children('.wrapper').each(function(idx){
            self = $(this);
            top = self.position().top;
            bottom = top + self.outerHeight();
            middle = (bottom - top) / 2 + top;
            if (x < middle){
                self.before(dropCursor);
                return false;
            }else{
                self.after(dropCursor);
            }
        });
    }
        
    function hitTest(){
        // test the dragging rect(s) against the target rect(s)
        // test all of the left borders first, then the top, right, bottom
        // goal is to eliminate negatives as fast as possible
        if (!dragTarget) {return;}
        var dropIndex = -1;
        var dropArea = 0;
        var dragType = blockType(dragTarget);
        var dragTargetFlap = dragTarget.children('.block');
        switch(dragType){
            case 'eventhandler':
                setTimeout(hitTest, dragTimeout);
                return positionDropCursor(); // no flap
            case 'step': dragTargetFlap = dragTargetFlap.children('.flap');
        }
        var dragRect = dragTargetFlap.rect();
        // console.log('dragRect: %s', rectToString(dragRect));
        var area = 0;
        $.each(dropRects, function(idx, elem){
            area = overlap(dragRect, elem);
            // console.log('match vs. %s: %s', rectToString(elem), area);
            if (area > dropArea){
                dropIndex = idx;
                dropArea = area;
                // console.log('found potential match');
            }
        else if(dragRect && elem){
        val = dist(dragRect["left"], dragRect["top"], elem["left"], elem["top"]);
        if(val < snapDist){ 
            dropIndex = idx;
            dropArea = area;
        }
        }
        });
        if (dropTarget && dropTarget.length){
            dropTarget.removeClass('drop_active');
        }
        if (dropIndex > -1){
            dropTarget = potentialDropTargets.eq(dropIndex).addClass('drop_active');
            dragTarget.addClass('drag_active');
            dropCursor.hide();
        }else{
            dragTarget.removeClass('drag_active');
            positionDropCursor();
            dropTarget = null;
        }
        timer = setTimeout(hitTest, dragTimeout);
    }
    
    // Initialize event handlers
    if (isTouch){
        $('.scripts_workspace, .block_menu').on('touchstart', '.block', initDrag);
        $('.content').live('touchmove', drag);
        $('.content').live('touchend', endDrag);
    }else{
        $('.scripts_workspace, .block_menu').on('mousedown', '.block', initDrag);
        $('.content').live('mousemove', drag);
        $('.content').live('mouseup', endDrag);
    }
    
    // Utility methods
    function mag(p1, p2){
        return Math.sqrt(Math.pow(p1.left - p2.left, 2) + Math.pow(p1.top - p2.top, 2));
    }
    //I didn't really need to rewrite the above, but I was tired and Couldn't get it to work. Sill can't :(
    function dist(p1, p2, m1, m2){
        return Math.sqrt(Math.pow(p1 - m1, 2) + Math.pow(p2 - m2, 2));  
    }
    
    function rectToString(r){
        return '<rect left: ' + r.left + ', top: ' + r.top + ', width: ' + r.width + ', height: ' + r.height + ', right: ' + r.right + ', bottom: ' + r.bottom + ', centerX = ' + r.centerX + ', centerY = ' + r.centerY + '>'; 
    }
    
    function overlap(r1, r2){ // determine area of overlap between two rects
        if (r1.left > r2.right){ return 0; }
        if (r1.right < r2.left){ return 0; }
        if (r1.top > r2.bottom){ return 0; }
        if (r1.bottom < r2.top){ return 0; }
        var max = Math.max, min = Math.min;
        return (max(r1.left, r2.left) - min(r1.right, r2.right)) * (max(r1.top, r2.top) - min(r1.bottom, r2.bottom));
    }
    
    // jQuery extensions
    $.fn.extend({
        rectToString: function(){
            return rectToString(this.rect());
        },
        rect: function(){
            var pos = this.offset();
            var width = this.outerWidth();
            var height = this.outerHeight();
            return {left: pos.left,
                    top: pos.top,
                    width: width,
                    height: height,
                    right: pos.left + width,
                    bottom: pos.top + height,
                    centerX: pos.left + width/2,
                    centerY: pos.top + height/2
            };
        },
        overlap: function(target){
            return overlap(this.rect(), target.rect());
        },
        area: function(){
            return this.outerWidth() * this.outerHeight();
        },
        containedBy: function(target){
          var targetArea = Math.min(this.area(), target.outerWidth() * this.outerHeight() * 0.90);
          return this.overlap(target) >= targetArea;  
        },
        cursorOver: function(){
            var rect = this.rect();
            return currentPosition.left >= rect.left && currentPosition.left <= rect.right &&
                   currentPosition.top >= rect.top && currentPosition.top <= rect.bottom;
        }
    });
    
})(jQuery);
