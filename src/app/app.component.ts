import { Component, OnInit, OnDestroy, ElementRef, ɵConsole } from '@angular/core';
import * as echarts from 'echarts';
import {
  combineLatest,
  concat,
  defer,
  EMPTY,
  empty, forkJoin,
  from,
  fromEvent,
  fromEventPattern,
  generate,
  interval, merge,
  NEVER,
  Observable,
  of, race,
  range,
  throwError,
  timer, zip
} from 'rxjs';
import { combineAll, concatAll, delay, map, mergeAll, startWith, take, withLatestFrom, zipAll } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'rx-test';
  // 拓扑图对象
  topologyChart: any;
  // 图表数据集
  topologyOption: object = {};
  // 每格小正方形在直角坐标中的边长
  SQUARE_SIDE_LENG = 10;
  // 小正方形的像素边长
  rectLength: number;
  // 修正图标位置时需要的直角坐标偏移量
  FIX_SIDE_LENG = this.SQUARE_SIDE_LENG / 2;
  // 每行的图标数
  PER_ROW_NUMBER = 5;
  // 图标总数
  numberOfIcon: number;
  // 用于记录图标位置
  iconPosition: Array<Array<number>> = [];
  // 用于存储自定义图形的配置项数据
  graphicArray: Array<any> = [];
  // 用于存储处于拖拽状态的图标的索引
  draggingArray = [];
  // 用于存储正在拖拽中的图标相对于直角坐标系的坐标
  draggingPosition = [];
  // 整个图形的坐标基点(当前1000x1000)
  basisPoint = [490, 510];

  constructor(
    private el: ElementRef,
  ) {
  }


  // emotion sucks
  rxjsTest(): void {
    const ho$ = interval(1000).pipe(take(2), map(x => interval(1500).pipe(map(y => x + ':' + y), take(2))));
    const concated$ = ho$.pipe(combineAll());
    concated$.subscribe(console.log);
  }


  ngOnInit(): void {
    this.rxjsTest();
    // 初始化图表所需数据
    this.initChartData();
    // 描绘图形
    this.topologyChart.setOption(this.topologyOption);
    // 生成图标
    this.generateGraphicIcon();
    // 窗口尺寸改变的时候重新定位图标
    window.addEventListener('resize', this.updatePosition.bind(this));
    // 数据区域缩放的时候重新定位图标
    this.topologyChart.on('dataZoom', this.updatePosition, this);
  }

  // 用于初始化图表所需数据
  initChartData() {
    // 拓扑图对象初始化
    this.topologyChart = echarts.init(this.el.nativeElement.querySelector('#echarts'), 'light');
    // 设置图标数目
    this.numberOfIcon = 22;
    // 生成图标的初始位置
    this.generateInitIconPosition();
    // 生成描绘直角坐标系所需数据
    this.topologyOption = this.generateGrid();
  }

  // 生成图标的初始位置
  generateInitIconPosition(): void {
    // 计算每行PER_LINE_NUMBER个图标的话一共有几行
    const FeedLineNumber = parseInt((this.numberOfIcon / this.PER_ROW_NUMBER).toString(), 10);
    // 计算初始坐标需要向上偏移几行
    const OffsetLineNumber = parseInt((FeedLineNumber / 2).toString(), 10);
    const firstPosition = [490 - this.SQUARE_SIDE_LENG * OffsetLineNumber, 510 + this.SQUARE_SIDE_LENG * OffsetLineNumber];
    for (let i = 0; i < this.numberOfIcon; i++) {
      const row = i % 5;
      const column = parseInt((i / 5).toString(), 10);
      this.iconPosition.push([firstPosition[0] + row * this.SQUARE_SIDE_LENG, firstPosition[1] - column * this.SQUARE_SIDE_LENG]);
    }
  }

  // 描绘直角坐标系所需数据集合
  generateGrid() {
    const option = {
      tooltip: {
        triggerOn: 'none',
        formatter: params => {
          return 'X: ' + params.data[0].toFixed(2) + '<br>Y: ' + params.data[1].toFixed(2);
        }
      },
      grid: {
        containLabel: false,
        width: '900px',
        height: '900px'
      },
      xAxis: {
        min: 0,
        max: 1000,
        maxInterval: 10,
        type: 'value',
        axisLine: { show: false, onZero: false },
        axisTick: { show: true },
        axisLabel: { show: true },
      },
      yAxis: {
        min: 0,
        max: 1000,
        maxInterval: 10,
        type: 'value',
        axisLine: { show: false, onZero: false },
        axisTick: { show: true },
        axisLabel: { show: true },
      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'none',
          throttle: 0
        },
        {
          type: 'inside',
          yAxisIndex: 0,
          filterMode: 'none',
          throttle: 0
        }
      ],
    };
    return option;
  }

  // 计算正方形的像素边长，用于设定图标大小以及阴影面积
  calculateRectLength() {
    const prePixelPosition = this.basisPoint;
    const preGridPosition = this.topologyChart.convertFromPixel('grid', prePixelPosition);
    const postGridPosition = [preGridPosition[0] - 5, preGridPosition[1] + 5];
    const postPixelPosition = this.topologyChart.convertToPixel('grid', postGridPosition);
    this.rectLength = Math.abs(prePixelPosition[0] - postPixelPosition[0]) * 2;
  }

  // 将拖拽后的图标位置修正到正方形中心
  fixPotionToRectCenter(position) {
    const truncPosition = [parseInt(position[0], 10), parseInt(position[1], 10)];
    const dx = parseInt((truncPosition[0] / 10).toString(), 10) * 10;
    const dy = parseInt((truncPosition[1] / 10).toString(), 10) * 10 + this.FIX_SIDE_LENG * 2;
    return [dx, dy];
  }

  // 图标拖拽过程中触发的事件
  onPointDragging(dataIndex, event) {
    this.draggingArray.push(dataIndex);
    const position = this.topologyChart.convertFromPixel('grid', [event.offsetX, event.offsetY]);
    const postPosition = this.fixPotionToRectCenter(position);
    this.draggingPosition = postPosition;
    const rectPosition = this.topologyChart.convertToPixel('grid', postPosition);
    this.calculateRectLength();
    // 生成填充的小正方形，每次拖拽必须重新计算边长
    this.topologyChart.setOption({
      graphic: [
        {
          id: `rect${dataIndex}`,
          type: 'rect',
          shape: {
            x: rectPosition[0],
            y: rectPosition[1],
            width: `${this.rectLength}`,
            height: `${this.rectLength}`
          },
          style: {
            fill: 'rgba(0,0,0,0.3)'
          }
        }
      ]
    });
  }

  // 图标拖拽完成时触发的事件
  onPointDragEnd(dataIndex, event) {
    const position = this.topologyChart.convertFromPixel('grid', [event.offsetX, event.offsetY]);
    this.iconPosition[dataIndex] = this.fixPotionToRectCenter(position);
    this.topologyChart.setOption({
      graphic: [
        {
          id: `icon${dataIndex}`,
          position: this.topologyChart.convertToPixel('grid', this.iconPosition[dataIndex])
        },
        {
          id: `rect${dataIndex}`,
          $action: 'remove',
        }
      ]
    });
    this.draggingArray.length = 0;
    this.draggingPosition.length = 0;
  }

  // 生成图标所需的数据集
  generateGraphicIconOptions(positionArray) {
    this.calculateRectLength();
    const postPositionArray = positionArray.map((item, index) => {
      return {
        id: `icon${index}`,
        type: 'image',
        position: this.topologyChart.convertToPixel('grid', item),
        style: {
          image: '/assets/img/vmS.svg',
          width: this.rectLength,
          height: this.rectLength
        },
        invisible: false,
        draggable: true,
        ondrag: echarts.util.curry(this.onPointDragging.bind(this), index),
        ondragend: echarts.util.curry(this.onPointDragEnd.bind(this), index),
        z: 100
      };
    });
    this.graphicArray = postPositionArray;
    return postPositionArray;
  }

  // 生成图标
  generateGraphicIcon() {
    const timerRos = setTimeout(() => {
      // 首先生成一次图标
      this.topologyChart.setOption({
        graphic: this.generateGraphicIconOptions(this.iconPosition)
      });

      // 之后进行相应的区域缩放，前一步必要的原因是没有series和graphic时没有可缩放的对象
      this.topologyChart.dispatchAction({
        type: 'dataZoom',
        start: 40,
        end: 60
      });

      // 重新计算图标大小
      this.calculateRectLength();

      // 调整图标大小，因为区域缩放会影响图标的大小
      this.topologyChart.setOption({
        graphic: echarts.util.map(this.iconPosition, () => {
          return {
            style: {
              image: '/assets/img/vmS.svg',
              width: this.rectLength,
              height: this.rectLength
            },
          };
        })
      });

      clearTimeout(timerRos);
    }, 0);
  }

  // 数据区域变化或者窗口尺寸变化时绑定的事件
  updatePosition() {
    this.calculateRectLength();
    // 有图标正在被拖拽时
    if (this.draggingArray.length) {
      const rectPosition = this.topologyChart.convertToPixel('grid', this.draggingPosition);
      this.topologyChart.setOption({
        graphic: echarts.util.map(this.iconPosition, (item, dataIndex) => {
          if (dataIndex !== this.draggingArray[0]) {
            return {
              position: this.topologyChart.convertToPixel('grid', item),
              style: {
                image: '/assets/img/vmS.svg',
                width: this.rectLength,
                height: this.rectLength
              }
            };
          } else {
            return {
              position: rectPosition,
              style: {
                image: '/assets/img/vmS.svg',
                width: this.rectLength,
                height: this.rectLength
              }
            };
          }
        })
      });
      this.topologyChart.setOption({
        graphic: {
          id: `rect${this.draggingArray[0]}`,
          shape: {
            x: rectPosition[0],
            y: rectPosition[1],
            width: `${this.rectLength}`,
            height: `${this.rectLength}`
          }
        }
      });
      // 没有图标拖拽时
    } else {
      this.topologyChart.setOption({
        graphic: echarts.util.map(this.iconPosition, (item, dataIndex) => {
          return {
            position: this.topologyChart.convertToPixel('grid', item),
            style: {
              image: '/assets/img/vmS.svg',
              width: this.rectLength,
              height: this.rectLength
            }
          };
        })
      });
    }
  }


  ngOnDestroy(): void {

  }


}
